import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 1순위 모델이 쿼터 초과(429) 시 순서대로 시도할 모델 후보군
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

    const prompt = `
당신은 대한민국 초·중등 수학 교육과정 전문가이자 학부모를 위한 코칭 멘토입니다.
초등 수학 및 중등 수학(중1 소인수분해, 정수와 유리수, 약수와 배수 등)의 교육과정 기준에 맞추어 이미지를 정밀 분석하세요.
제공된 이미지에 포함된 모든 수학 문제(손글씨 풀이 포함)를 빠짐없이 순서대로 분석해야 합니다.
응답 속도를 위해 각 설명과 단계는 핵심 위주로 명확하고 간결하게(1~2문장 이내) 작성하세요.

특히 소수/합성수, 약수/배수 판별 문제에서는:
- 소수: 약수가 1과 자기 자신 2개뿐인 이유 명시
- 합성수: 1과 자신 외에 다른 곱셈 조합(약수 3개 이상)이 있는 이유 명시

반드시 아래 JSON 규격으로만 응답하세요:
{
  "problems": [
    {
      "problem_number": "문제 번호 (예: 1번, 2번 등)",
      "problem_text": "인식된 문제 핵심 요약 (1문장)",
      "correct_answer": "최종 정답 (예: 소수: 4개 (2, 13, 47, 59), 합성수: 4개 (9, 15, 27, 33))",
      "solution_steps": [
        "1단계: 조건 파악 및 수식/원리 기준",
        "2단계: 소수/합성수 등 구체적 판별 근거",
        "3단계: 최종 정답 도출 및 주의할 점"
      ],
      "student_answer": "학생이 작성한 답 또는 풀이 (없으면 '작성 없음')",
      "is_correct": true,
      "concept": "단원 및 핵심 개념 (예: 중1-1 소인수분해)",
      "error_analysis": "오답 원인 분석 (정답일 경우 '정상 풀이 완료' 기재)",
      "parent_script": [
        "1단계: 아이의 생각을 묻는 유도 질문",
        "2단계: 일상 비유를 활용한 개념 설명",
        "3단계: 스스로 답을 확인하게 만드는 점검 질문"
      ],
      "twin_problem": {
        "question": "동일 유형의 숫자와 조건만 바꾼 쌍둥이 확인 문제",
        "answer": "정답 및 핵심 풀이"
      }
    }
  ]
}
`;

    let resultJson = null;
    let lastError: any = null;

    // 모델 리스트를 순회하며 호출 시도
    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[Gemini Request] 시도 중인 모델: ${modelName}`);

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
        break; // 성공 시 반복문 탈출
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || "";
        
        // 429(할당량 초과) 또는 503(일시적 과부하)일 경우 다음 모델로 자동 전환
        const isQuotaError =
          errMsg.includes("429") ||
          errMsg.includes("Quota exceeded") ||
          errMsg.includes("ResourceExhausted") ||
          errMsg.includes("Too Many Requests");

        if (isQuotaError) {
          console.warn(`[Quota Warning] ${modelName} 쿼터 초과. 예비 모델로 전환합니다...`);
          continue; // 다음 모델 시도
        } else {
          // 쿼터 문제가 아닌 다른 치명적 에러라면 중단
          console.error(`[Fatal Error] ${modelName} 호출 실패:`, err);
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