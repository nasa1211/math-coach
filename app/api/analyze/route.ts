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

  // 0. AI가 역슬래시를 과도하게 중첩해서 보낸 경우 바로잡기
  cleanText = cleanText.replace(/\\\\+/g, "\\");

  // 🚨 [강력 자동 교정 로직]
  // 1. 공백, 제어문자, 또는 역슬래시가 빠진 frac 형태를 완벽하게 \frac로 복구
  cleanText = cleanText
    .replace(/[\x0C]/g, "")
    .replace(/\\?\s*[\f]?\s*rac\b/g, "\\frac")
    .replace(/(?<!\\)\bfrac\b/g, "\\frac");

  // 2. 중괄호가 누락된 frac 형태 보정 (예: \frac 3 5 -> \frac{3}{5})
  cleanText = cleanText.replace(/\\frac\s*([0-9a-zA-Z\-\+]+)\s*([0-9a-zA-Z\-\+]+)/g, "\\frac{$1}{$2}");

  // 3. AI가 백슬래시 없이 보낸 명령어 앞에 자동으로 역슬래시 부착
  cleanText = cleanText
    .replace(/(?<!\\)\btimes\b/g, "\\times")
    .replace(/(?<!\\)\bleft\b/g, "\\left")
    .replace(/(?<!\\)\bright\b/g, "\\right")
    .replace(/(?<!\\)\bneq\b/g, "\\neq");

  // 4. JSON 문자열 내에서 안전하게 이중 백슬래시(\\)로 변환 (KaTeX 및 JSON 파싱 양쪽 다 대응)
  // 단, 이미 이중으로 되어 있는 것은 유지하고 단일 백슬래시만 안전하게 이중화
  cleanText = cleanText
    .replace(/([^\\])\\(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "$1\\\\$2")
    .replace(/^\\(frac|times|div|pm|left|right|sqrt|pi|neq)/gm, "\\\\$1");

  // 1차 파싱 시도
  try {
    return JSON.parse(cleanText);
  } catch (initialError) {
    try {
      // JSON 내 특수문자 탈출 이슈가 있을 경우 보정 후 재시도
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
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 오직 순수 JSON 형식으로만 답변하세요.

[수학 기호 판독 및 엄격한 검산 규칙]:
1. 거듭제곱의 지수(예: 2³, 3ᵃ, x²)를 일반 정수(23, 3a)로 오인하지 않도록 글자 크기와 높이를 주의 깊게 확인하세요.
2. 곱셈 기호(×), 덧셈(+), 마이너스(-), 소수점(.), 쉼표(,)를 명확하게 구분하세요.
3. [필수] 객관식 보기 및 수식 검증: 문제에 포함된 보기(①, ②, ③, ④, ⑤ 등)나 등식의 참/거짓을 판별할 때, 각 등식의 좌변과 우변을 실제로 엄밀하게 계산하여 수학적으로 완전히 일치하는지 철저히 검산하세요. 
4. 아이의 손글씨 답안을 먼저 정확하게 읽고, 교재 인쇄본 문제의 조건과 단계별로 대조하여 정오답을 판정하세요.

[수식 표기 필수 규칙]:
1. 수식($...$) 안에는 오직 수학 기호, 숫자, 변수만 넣으세요. 절대 한글 설명이나 'a =', 'y =' 같은 좌변 이름을 수식($) 안에 함께 넣지 마세요.
   - 올바른 예시: "기울기는 $\\frac{3}{5}$ 입니다." 또는 "식은 $y = \\frac{3}{5}x$ 입니다."
2. 모든 수학 수식은 반드시 인라인 LaTeX 형식인 단일 달러 기호($...$)로만 작성하고, 절대 전체 문장을 블록 수식으로 감싸지 마세요.
3. 분수는 반드시 중괄호가 포함된 \\frac{분자}{분모} 형태로만 작성하세요. (예: $\\frac{3}{5}$)
4. JSON 문자열 내부에서 역슬래시는 반드시 이중 백슬래시(\\\\frac, \\\\times)로 작성되도록 하세요.

[수식 줄바꿈 및 결합 엄격 규칙]:
1. 등식이 포함된 수식은 절대 좌변($y =$)과 우변을 쪼개서 작성하지 마세요. 반드시 하나의 달러 기호 안에 좌변, 등호, 우변을 모두 함께 넣어야 합니다.
2. **[매우 중요] 보기 대입 풀이(①, ②, ③ 등)를 작성할 때, 절대 대입식($x = ...$)을 길게 늘여서 쪼개 쓰지 마세요.** 마이너스(-) 기호나 분수가 줄바꿈되면 안 됩니다.
   - 올바른 예시: "① $x = -15$ 대입: $y = \\frac{3}{5} \\times (-15) = -9$ (성립하지 않음)"
   - 올바른 예시: "② $x = -\\frac{6}{5}$ 대입: $y = \\frac{3}{5} \\times \\left(-\\frac{6}{5}\\right) = -\\frac{18}{25}$ (성립하지 않음)"
3. 각 보기의 풀이는 반드시 **한 줄(Single Line)** 안에 모두 들어가도록 수식을 간결하게 구성하고, 절대 줄바꿈 문자를 수식 중간에 넣지 마세요.

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
             "is_correct": true,
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