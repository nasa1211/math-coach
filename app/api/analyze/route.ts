// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 시도할 모델 우선순위 목록 (트래픽 과부하 시 순차적으로 자동 전환)
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

  // 가장 바깥쪽 { ... } 추출
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  // 🚨 [강력 자동 교정 로직]
  // 1. 공백이나 제어문자가 낀 frac 형태를 표준 \frac로 교정
  cleanText = cleanText
    .replace(/[\x0C]/g, "")
    .replace(/\\\s*[\f]?\s*rac/g, "\\frac")
    .replace(/\bfract?\b/g, "\\frac");

  // 2. 중괄호가 누락된 형태(예: \frac5x 등)를 자동으로 \frac{5}{x} 형태로 변환하는 정밀 보정
  cleanText = cleanText.replace(/\\frac\s*([0-9a-zA-Z\-\+]+)\s*([0-9a-zA-Z\-\+]+)/g, "\\frac{$1}{$2}");

  // 3. JSON 문자열 내에서 안전하게 이중 백슬래시(\\)로 변환
  cleanText = cleanText
    .replace(/\\frac/g, "\\\\frac")
    .replace(/\\times/g, "\\\\times")
    .replace(/\\div/g, "\\\\div")
    .replace(/\\pm/g, "\\\\pm")
    .replace(/\\left/g, "\\\\left")
    .replace(/\\right/g, "\\\\right")
    .replace(/\\sqrt/g, "\\\\sqrt")
    .replace(/\\pi/g, "\\\\pi");

  // 1차 파싱 시도
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

const prompt = `
당신은 대한민국 초·중등 수학 교육과정 전문 AI 홈코치이자 엄격한 수학 검수관입니다.
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 **오직 순수 JSON 형식**으로만 답변하세요.

[수학 기호 판독 및 엄격한 검산 규칙]:
1. 거듭제곱의 지수(예: 2³, 3ᵃ, x²)를 일반 정수(23, 3a)로 오인하지 않도록 글자 크기와 높이를 주의 깊게 확인하세요.
2. 곱셈 기호(×), 덧셈(+), 마이너스(-), 소수점(.), 쉼표(,)를 명확하게 구분하세요.
3. **[필수] 객관식 보기 및 수식 검증**: 문제에 포함된 보기(①, ②, ③, ④, ⑤ 등)나 등식의 참/거짓을 판별할 때, **각 등식의 좌변과 우변을 실제로 엄밀하게 계산하여 수학적으로 완전히 일치하는지 철저히 검산**하세요. 
4. 아이의 손글씨 답안을 먼저 정확하게 읽고, 교재 인쇄본 문제의 조건과 단계별로 대조하여 정오답을 판정하세요.

[수식 표기 필수 규칙]:
1. 모든 수학 수식(분수, 방정식, 기호 등)은 **반드시 인라인 LaTeX 형식인 단일 달러 기호($...$)로만** 작성하세요.
2. **절대 전체 문장을 \`$$...$$
\` (블록 수식)로 감싸거나, 수식 때문에 문장 중간에 임의로 줄바꿈을 넣지 마세요.** 문장이 위아래로 찢어지면 안 됩니다.
   - 올바른 예시: "기울기는 $\\frac{3}{5}$ 입니다."
3. **[매우 중요] 분수는 반드시 중괄호가 포함된 \\frac{분자}{분모} 형태로만 작성하세요.** (예: $\\frac{100}{x}$, $\\frac{5}{x}$, $-\\frac{1}{3}x$, $\\frac{3}{5}$)
4. JSON 문자열 내부에서 역슬래시는 반드시 이중 백슬래시(\\\\frac, \\\\times)로 작성되도록 하세요.

[JSON 반환 스키마]:
{
  "mode": "${mode}",
  "problems": [
    {
      "problem_number": "문항 번호 (예: 1번)",
      "problem_text": "문제 지문 요약",
      "correct_answer": "정답",
      "solution_steps": ["1단계 풀이", "2단계 풀이"],
      "concept": "단원 및 핵심 개념",
      ${
        mode === "guide"
          ? `"teaching_tip": "학부모를 위한 지도 팁 및 함정"`
          : `"student_answer": "아이가 작성한 답안",
             "is_correct": true 또는 false,
             "error_analysis": "오답 원인 분석",
             "parent_script": ["아이 코칭 대화 1단계", "2단계"],
             "twin_problem": {
               "question": "쌍둥이 확인 문제",
               "answer": "쌍둥이 문제 정답 및 해설"
             }`
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
            temperature: 0.2,
          },
        });

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        parsedData = safeJsonParse(responseText);

        console.log(`[AI 분석 성공] 사용된 모델: ${modelName}`);
        break;
      } catch (err: any) {
        console.warn(`[AI 분석 실패 - 모델: ${modelName}]`, err?.message || err);
        lastError = err;
      }
    }

    if (!parsedData) {
      console.error("[모든 모델 분석 실패]", lastError);
      return NextResponse.json(
        {
          error: "일시적으로 모든 AI 서버의 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
          details: lastError?.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("서버 처리 에러:", error);
    return NextResponse.json(
      { error: error?.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}