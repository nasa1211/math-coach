import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const CANDIDATE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const mode = (formData.get("mode") as string) || "grade"; // "grade" 또는 "guide"

    if (!file) {
      return NextResponse.json(
        { error: "이미지 파일이 전달되지 않았습니다." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    // 모드별 프롬프트 분기
    const prompt =
      mode === "guide"
        ? `
당신은 대한민국 초·중등 수학 교육과정 전문가이자 학부모를 위한 코칭 멘토입니다.
제공된 이미지는 아직 풀지 않은 새 수학 문제집 페이지입니다.
학부모가 아이에게 문제를 지도하기 전에 핵심을 빠르게 숙지할 수 있도록 문제를 분석하세요.
응답 속도를 위해 간결하고 명확하게 작성하세요.

반드시 아래 JSON 스키마 규격으로만 응답하세요:
{
  "mode": "guide",
  "problems": [
    {
      "problem_number": "문제 번호 (예: 1번, 2번)",
      "problem_text": "문제 핵심 요약 (1문장)",
      "concept": "단원 및 핵심 원리/공식 (예: 중1 소인수분해, 초5 분수의 덧셈)",
      "correct_answer": "최종 정답",
      "solution_steps": [
        "1단계: 주목해야 할 핵심 조건 및 식 세우기",
        "2단계: 핵심 계산 과정",
        "3단계: 검산 또는 결론 도출"
      ],
      "teaching_tip": "아이가 자주 실수하거나 헷갈려하는 함정 포인트 및 부모의 유도 팁 (1~2문장)"
    }
  ]
}
`
        : `
당신은 대한민국 초·중등 수학 교육과정 전문가이자 학부모를 위한 코칭 멘토입니다.
제공된 이미지에 포함된 학생의 손글씨 풀이를 포함하여 모든 문제를 정밀 채점하고 코칭 가이드를 제공하세요.
응답 속도를 위해 간결하고 명확하게 작성하세요.

반드시 아래 JSON 스키마 규격으로만 응답하세요:
{
  "mode": "grade",
  "problems": [
    {
      "problem_number": "문제 번호",
      "problem_text": "인식된 문제 핵심 요약 (1문장)",
      "correct_answer": "최종 정답",
      "solution_steps": [
        "1단계: 조건 파악 및 수식/원리 기준",
        "2단계: 소수/합성수 등 구체적 판별 근거",
        "3단계: 최종 정답 도출 근거"
      ],
      "student_answer": "학생이 작성한 답 또는 풀이 (없으면 '작성 없음')",
      "is_correct": true,
      "concept": "단원 및 핵심 개념",
      "error_analysis": "오답 원인 분석 (정답일 경우 '정상 풀이 완료')",
      "parent_script": [
        "1단계: 아이의 생각을 묻는 유도 질문",
        "2단계: 일상 비유를 활용한 개념 설명",
        "3단계: 스스로 답을 확인하게 만드는 점검 질문"
      ],
      "twin_problem": {
        "question": "동일 유형의 쌍둥이 확인 문제",
        "answer": "정답 및 핵심 풀이"
      }
    }
  ]
}
`;

    let resultJson = null;
    let lastError: any = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[Gemini Request] mode: ${mode}, model: ${modelName}`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 4096,
            // @ts-ignore
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        });

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
        ]);

        const rawResponse = result.response.text();
        resultJson = JSON.parse(rawResponse);
        console.log(`[Gemini Success] 분석 성공 모델: ${modelName}`);
        break;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || "";
        const isQuotaError =
          errMsg.includes("429") ||
          errMsg.includes("Quota exceeded") ||
          errMsg.includes("ResourceExhausted") ||
          errMsg.includes("Too Many Requests");

        if (isQuotaError) {
          console.warn(`[Quota Warning] ${modelName} 쿼터 초과. 다음 모델 시도...`);
          continue;
        } else {
          console.error(`[Fatal Error] ${modelName} 실패:`, err);
          break;
        }
      }
    }

    if (!resultJson) {
      throw lastError || new Error("모든 예비 모델의 호출 가능 쿼터가 소진되었습니다.");
    }

    return NextResponse.json(resultJson);
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    return NextResponse.json(
      { error: error.message || "분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}