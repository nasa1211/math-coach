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

==================================================
[학생 답안 스캔 및 채점 판정 - 최우선 절대 규칙]
==================================================
채점 작업("${mode}" === "grade") 시, 오답/정답 판정에 앞서 반드시 다음 3단계를 수행하세요:

1단계 [손글씨 스캔]:
  - 이미지 내에서 **인쇄된 텍스트(문제지 본문, 보기)**와 **학생이 직접 기입한 손글씨(연필/펜 자국, 동그라미, 체크, 밑줄, 숫자 작성 등)**를 엄격히 구분하세요.

2단계 [답안 존재 여부 결정]:
  - 학생의 손글씨/표시가 전혀 없는 문제라면:
    * "student_answer": "미작성"
    * "is_correct": false
    * "error_analysis": "문제지에 학생의 답안 표기가 없습니다. 아이가 직접 풀이 및 답을 기재한 후 다시 촬영해 주세요."
    * "parent_script": ["아이에게 스스로 풀어볼 수 있도록 용기를 북돋아 주시고, 풀이 작성 후 다시 스캔해 주세요."]

3단계 [실제 채점 진행]:
  - **오직 명확한 학생 손글씨/표시가 존재하는 경우에만** 해당 답을 읽어 실제 정답과 비교 및 채점하세요.
  - 학생이 푼 결과와 실제 정답이 다르면 "is_correct": false, 일치하면 "is_correct": true 로 처리합니다.

※ 경고: 학생 답안 표기가 없는데도 임의로 답을 추측하여 "is_correct": true 로 처리하거나 가상의 답을 만들어내는 환각(Hallucination)을 절대 금지합니다.

==================================================
[수식 및 LaTeX 작성 원칙 - 반드시 준수]
==================================================
1. [가장 중요] 분수를 작성할 때 역슬래시(\\)와 중괄호({})를 절대로 생략하지 마세요!
   - ❌ 잘못된 예: y = frac35x, -frac65, frac1825
   - ⭕ 올바른 예: y = \\\\frac{3}{5}x, -\\\\frac{6}{5}, \\\\frac{18}{25}
2. 수식 기호($...$) 내부에는 수학 기호, 숫자, 변수만 포함합니다.
3. 곱셈 기호는 "times"가 아닌 반드시 "\\\\times" 로 작성하세요.

==================================================
[줄바꿈 및 보기 가독성 가이드]
==================================================
1. 등식이 포함된 수식은 좌변($y =$)과 우변을 분리하지 말고 하나의 수식 기호 안($y = \\\\frac{3}{5}x$)에 작성하세요.
2. 각 보기 풀이 또는 단계별 설명 사이에는 반드시 줄바꿈(\\n)을 추가하세요.
   - 올바른 예: "① $x = -15$ 대입: $y = \\\\frac{3}{5} \\\\times (-15) = -9$ (불성립)\\n② $x = -\\\\frac{6}{5}$ 대입: $y = \\\\frac{3}{5} \\\\times \\\\left(-\\\\frac{6}{5}\\\\right) = -\\\\frac{18}{25}$ (불성립)"

==================================================
[JSON 반환 스키마]
==================================================
{
  "mode": "${mode}",
  "problems": [
    {
      "problem_number": "문항 번호 (예: 1번)",
      "problem_text": "문제 지문 요약",
      "correct_answer": "실제 정답",
      "solution_steps": ["1단계 풀이", "2단계 풀이"],
      "concept": "단원 및 핵심 개념",
      ${
        mode === "guide"
          ? `"teaching_tip": "부모님 사전 지도 팁 및 함정 요소"`
          : `"student_answer": "학생이 쓴 답 또는 '미작성'",
             "is_correct": true 또는 false,
             "error_analysis": "오답 원인 분석 (미작성 시 안내 문구)",
             "parent_script": ["코칭 대화 1", "코칭 대화 2"],
             "twin_problem": {"question": "유사 쌍둥이 문제", "answer": "쌍둥이 문제 정답 및 해설"}`
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