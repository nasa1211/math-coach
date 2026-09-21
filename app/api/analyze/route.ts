// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CANDIDATE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

// --- [수식 교정 엔진] ---
function fixMath(str: string) {
  let res = str;
  
  // 0. 과도한 역슬래시 축소 (\\frac -> \frac)
  res = res.replace(/\\\\(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "\\$1");

  // 1. 역슬래시가 없는 키워드 강제 복구
  res = res.replace(/(?<![a-zA-Z\\])(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "\\$1");

  // 2. 중괄호 없이 숫자가 뭉친 분수 완벽 복구
  res = res.replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}");
  res = res.replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");

  return res;
}

function fixMathInObject(obj: any): any {
  if (typeof obj === 'string') {
    return fixMath(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(item => fixMathInObject(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = fixMathInObject(obj[key]);
    }
    return newObj;
  }
  return obj;
}

function safeJsonParse(rawText: string) {
  let cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  let parsedData;
  try {
    parsedData = JSON.parse(cleanText);
  } catch (initialError) {
    try {
      const fixedText = cleanText.replace(/\\/g, "\\\\");
      parsedData = JSON.parse(fixedText);
    } catch {
      throw initialError; 
    }
  }

  return fixMathInObject(parsedData);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as Blob | null;
    const mode = (formData.get("mode") as string) || "grade";

    if (!imageFile) {
      return NextResponse.json({ error: "이미지가 전송되지 않았습니다." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: imageFile.type || "image/jpeg",
      },
    };

    const prompt = `
당신은 대한민국 초·중등 수학 교육과정 전문 AI 홈코치이자 엄격한 수학 검수관입니다.
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 오직 순수 JSON 형식으로만 답변하세요.

[학생 답안 OCR 및 채점 절대 규칙 - 매우 중요]:
1. 이미지 내에 학생이 동그라미, 체크, 손글씨 등으로 직접 표기한 답안이 있는지 정밀하게 스캔하세요.
2. 이미지에 학생의 답안 표기가 전혀 없는 경우(깨끗한 문제지 등):
   - "student_answer": "미작성"
   - "is_correct": false
   - "error_analysis": "문제지에 학생의 답안 표기가 없습니다. 정답을 표시한 후 다시 채점해 주세요."
3. 학생 답안 표기가 명확히 존재하는 경우에만 해당 표기를 읽어 실제 정답과 비교 채점하세요.

[수식 표기 절대 원칙 - 반드시 지킬 것]:
1. [가장 중요] 분수를 작성할 때 절대 "frac35", "frac1825" 처럼 역슬래시(\\)와 중괄호({})를 생략하지 마세요!
   - ❌ 잘못된 예: y = frac35x, -frac65, frac1825
   - ⭕ 올바른 예: y = \\\\frac{3}{5}x, -\\\\frac{6}{5}, \\\\frac{18}{25}
2. 수식($...$) 안에는 오직 수학 기호, 숫자, 변수만 넣으세요.
3. 곱셈 기호 역시 "times"가 아니라 반드시 "\\\\times" 로 작성하세요.

[수식 줄바꿈 및 보기 작성 가이드]:
1. 등식이 포함된 수식은 좌변($y =$)과 우변을 쪼개지 말고 하나의 수식 기호 안에 넣으세요.
2. 각 보기 풀이(①, ②, ③, ④, ⑤ 또는 1단계, 2단계) 사이에는 가독성을 위해 반드시 줄바꿈(\\n)을 넣어서 분리하세요.
   - 올바른 예시: "① $x = -15$ 대입: $y = \\\\frac{3}{5} \\\\times (-15) = -9$ (성립하지 않음)\\n② $x = -\\\\frac{6}{5}$ 대입: $y = \\\\frac{3}{5} \\\\times \\\\left(-\\\\frac{6}{5}\\\\right) = -\\\\frac{18}{25}$ (성립하지 않음)"

[JSON 반환 스키마]:
{
  "mode": "${mode}",
  "problems": [
    {
      "problem_number": "문항 번호",
      "problem_text": "지문 요약",
      "correct_answer": "정답",
      "solution_steps": ["1단계 풀이", "2단계 풀이"],
      "concept": "단원 개념",
      ${
        mode === "guide"
          ? `"teaching_tip": "지도 팁"`
          : `"student_answer": "답안", "is_correct": true, "error_analysis": "원인 분석", "parent_script": ["대화 1", "대화 2"], "twin_problem": {"question": "문제", "answer": "해설"}`
      }
    }
  ]
}
`;

    let lastError: any = null;
    let parsedData = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[AI 분석 시도] 모델: ${modelName}`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        parsedData = safeJsonParse(responseText);
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!parsedData) {
      return NextResponse.json({ error: "분석 실패", details: lastError?.message }, { status: 500 });
    }

    return NextResponse.json(parsedData);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}