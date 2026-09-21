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

function safeJsonParse(rawText: string) {
  let cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  // 0. 역슬래시 중첩 정리
  cleanText = cleanText.replace(/\\\\+/g, "\\");

  // 🚨 [궁극의 자동 교정 로직: 뭉쳐있는 텍스트 강제 분해]
  // 1. 단어 경계(\b) 무시하고 frac, times 등 명령어 앞에 무조건 역슬래시 추가
  cleanText = cleanText
    .replace(/(?<!\\)frac/g, "\\frac")
    .replace(/(?<!\\)times/g, "\\times")
    .replace(/(?<!\\)left/g, "\\left")
    .replace(/(?<!\\)right/g, "\\right")
    .replace(/(?<!\\)neq/g, "\\neq");

  // 2. 중괄호가 빠지고 숫자가 뭉친 엉망진창 분수 강제 복구 (예: \frac35 -> \frac{3}{5})
  // - 두 자리 분모인 경우 (예: \frac1825 -> \frac{18}{25})
  cleanText = cleanText.replace(/\\frac([0-9]{1,2})([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}");
  // - 한 자리 숫자들끼리 뭉친 경우 (예: \frac35 -> \frac{3}{5})
  cleanText = cleanText.replace(/\\frac([0-9])([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
  // - 식 형태로 뭉친 특수 케이스 (예: \frac3-05-0 -> \frac{3-0}{5-0})
  cleanText = cleanText.replace(/\\frac([0-9]\-[0-9])([0-9]\-[0-9])/g, "\\frac{$1}{$2}");

  // 3. JSON 문자열 내에서 안전하게 이중 백슬래시로 변환
  cleanText = cleanText
    .replace(/([^\\])\\(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "$1\\\\$2")
    .replace(/^\\(frac|times|div|pm|left|right|sqrt|pi|neq)/gm, "\\\\$1");

  try {
    return JSON.parse(cleanText);
  } catch (initialError) {
    try {
      const fixedText = cleanText.replace(/\\([a-zA-Z])/g, "\\\\$1");
      return JSON.parse(fixedText);
    } catch {
      throw initialError; 
    }
  }
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

    // [프롬프트 핵심 개선] AI가 꼼수를 부리지 못하도록 강력한 금지어 설정
    const prompt = `
당신은 대한민국 초·중등 수학 교육과정 전문 AI 홈코치이자 엄격한 수학 검수관입니다.
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 오직 순수 JSON 형식으로만 답변하세요.

[수식 표기 절대 원칙 - 반드시 지킬 것]:
1. [가장 중요] 분수를 작성할 때 절대 "frac35", "frac1825" 처럼 역슬래시(\\)와 중괄호({})를 생략하지 마세요!
   - ❌ 잘못된 예: y = frac35x, -frac65, frac1825
   - ⭕ 올바른 예: y = \\\\frac{3}{5}x, -\\\\frac{6}{5}, \\\\frac{18}{25}
2. 수식($...$) 안에는 오직 수학 기호, 숫자, 변수만 넣으세요.
3. 곱셈 기호 역시 "times"가 아니라 반드시 "\\\\times" 로 작성하세요.

[수식 줄바꿈 및 결합 엄격 규칙]:
1. 등식이 포함된 수식은 절대 좌변($y =$)과 우변을 쪼개지 말고 하나의 수식 기호 안에 넣으세요.
2. 보기 대입 풀이 시 줄바꿈 없이 하나의 식으로 작성하세요.
   - 올바른 예시: "① $x = -15$ 대입: $y = \\\\frac{3}{5} \\\\times (-15) = -9$ (성립하지 않음)"
   - 올바른 예시: "② $x = -\\\\frac{6}{5}$ 대입: $y = \\\\frac{3}{5} \\\\times \\\\left(-\\\\frac{6}{5}\\\\right) = -\\\\frac{18}{25}$ (성립하지 않음)"

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
            temperature: 0.1, // 창의성(오류 가능성)을 낮추기 위해 0.1로 조정
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