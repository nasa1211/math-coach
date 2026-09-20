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

// LaTeX 수식 역슬래시(\)로 인한 JSON 파싱 에러 방어 함수
function safeJsonParse(rawText: string) {
  // 1. 마크다운 코드블록 제거
  let cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  // 2. 가장 바깥쪽 { ... } 추출
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  // 1차 파싱 시도
  try {
    return JSON.parse(cleanText);
  } catch (initialError) {
    // LaTeX 역슬래시(\times, \frac 등)가 JSON에서 유효하지 않은 이스케이프로 인식될 때 이중 역슬래시로 보정
    try {
      const fixedText = cleanText.replace(/\\([a-zA-Z])/g, "\\\\$1");
      return JSON.parse(fixedText);
    } catch {
      throw initialError; // 보정 후에도 실패 시 원본 에러 투척
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

// app/api/analyze/route.ts 프롬프트 보강 부분
    const prompt = `
당신은 대한민국 초·중등 수학 교육과정 전문 AI 홈코치입니다.
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 **오직 순수 JSON 형식**으로만 답변하세요.

[수학 기호 판독 주의사항]:
1. 거듭제곱의 지수(예: 2³, 3ᵃ, x²)를 일반 정수(23, 3a)로 오인하지 않도록 글자 크기와 높이를 주의 깊게 확인하세요.
2. 곱셈 기호(×), 덧셈(+), 마이너스(-), 소수점(.), 쉼표(,)를 명확하게 구분하세요.
3. 아이의 손글씨 답안을 먼저 정확하게 읽고, 교재 인쇄본 문제의 조건(최대공약수, 최소공배수, 분수 연산 등)을 단계별로 검산하여 정오답을 판정하세요.

[수식 표기]:
수식은 LaTeX 문법($...$)을 적용하고, JSON 파싱 오류가 없도록 올바르게 작성하세요.

[수식 표기 필수 규칙]
- 분수, 제곱, 음수 괄호, 곱셈 기호(\times) 등 모든 수학적 수식과 식은 반드시 앞뒤에 달러 기호($)를 붙여 인라인 LaTeX 형식($...$)으로 출력하세요.
- 올바른 예시: "$\left(-\frac{1}{28}\right) \times (-4) = +\frac{1}{7}$"
- 잘못된 예시: "\left(-\frac{1}{28}\right) \times (-4)" (달러 기호 누락 금지)
- 한 문장 안에 수식이 여러 개 나올 때도 각각 $ 기호로 감싸야 합니다.

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