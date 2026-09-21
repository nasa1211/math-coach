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
  // 예: \frac5x -> \frac{5}{x}, \frac100x -> \frac{100}{x} 등
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
   - 예: 만약 보기 중 '\frac{1}{3} \times \frac{1}{3} = \frac{2}{3^2}'과 같은 식이 있다면, 좌변은 \frac{1}{9}인데 우변은 \frac{2}{9}(또는 잘못된 값)이 되므로 이는 **명백한 수학적 오류(오답)**임을 정확히 포착해야 합니다. 수식을 대충 읽고 맞다고 넘어가면 절대 안 됩니다.
4. 아이의 손글씨 답안을 먼저 정확하게 읽고, 교재 인쇄본 문제의 조건과 단계별로 대조하여 정오답을 판정하세요.

[수식 표기]:
수식은 LaTeX 문법($...$)을 적용하고, JSON 파싱 오류가 없도록 올바르게 작성하세요.

[수식 표기 필수 규칙]:
1. 분수, 제곱, 음수 괄호, 곱셈 기호(\times) 등 모든 수학적 수식과 식은 반드시 앞뒤에 달러 기호($)를 붙여 인라인 LaTeX 형식($...$)으로 출력하세요.
2. **[매우 중요] 분수는 반드시 중괄호가 포함된 \frac{분자}{분모} 형태로만 작성하세요.** (예: $\frac{100}{x}$, $\frac{5}{x}$, $-\frac{1}{3}x$, $\frac{3}{5}$)
3. 절대 'frac100x'나 중괄호가 빠진 'frac5x' 같은 형태로 출력하지 마세요. 반드시 \frac{값}{값} 형식을 지켜야 합니다.
4. JSON 문자열 내부에서 역슬래시는 반드시 이중 백슬래시(\\frac, \\times)로 작성되도록 하세요.

[수식 표기 및 JSON 역슬래시 필수 규칙]:
- LaTeX 수식을 작성할 때, 분수 등 역슬래시가 들어가는 명령어는 반드시 이중 백슬래시(\\frac, \\times 등)를 사용하여 JSON 문자열 내에서 유실되지 않도록 하세요.
- 올바른 예시: "$\\frac{100}{x}$", "$\\frac{4}{x}$"
- 잘못된 예시: "$\frac{100}{x}$" (백슬래시가 단일이면 JSON 파싱 시 깨지므로 금지)

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

    // 🔄 모델 순차 폴백 루프 (503 또는 일시적 에러 발생 시 다음 모델로 자동 전환)
    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[AI 분석 시도] 모델: ${modelName}`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json", // JSON 모드 강제
            temperature: 0.2,
          },
        });

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        // JSON 안전 파싱
        parsedData = safeJsonParse(responseText);

        console.log(`[AI 분석 성공] 사용된 모델: ${modelName}`);
        break; // 성공 시 루프 탈출
      } catch (err: any) {
        console.warn(`[AI 분석 실패 - 모델: ${modelName}]`, err?.message || err);
        lastError = err;
        // 다음 모델로 계속 진행 (사용자 화면에는 에러 노출 안 됨)
      }
    }

    // 모든 모델이 실패했을 경우에만 클라이언트에 500 에러 전달
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