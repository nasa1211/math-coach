// app/api/analyze/route.ts

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// 모델 설정
// ============================================================

const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

// 정답 불일치 발생 시 사용할 재검증 모델
const VERIFIER_MODELS = [
  "gemini-2.5-pro",
  "gemini-3.8-flash",
];

// ============================================================
// 타입
// ============================================================

type AnalyzeMode = "grade" | "guide";

interface TwinProblem {
  question: string;
  answer: string;
}

interface Problem {
  problem_number: string;
  problem_text: string;

  // 최종 정답
  correct_answer: string;

  // 풀이
  solution_steps: string[];

  concept: string;

  // AI가 풀이 마지막에서 실제로 구한 값
  // 서버의 정답-풀이 일치 검증용
  final_answer?: string;

  // grade 모드
  student_answer?: string;
  is_correct?: boolean;
  error_analysis?: string;
  parent_script?: string[];
  twin_problem?: TwinProblem;

  // guide 모드
  teaching_tip?: string;
}

interface AnalyzeResponse {
  mode: AnalyzeMode;
  problems: Problem[];
}

// ============================================================
// 수식 보정
// ============================================================

function fixMath(str: string): string {
  if (typeof str !== "string") return str;

  // 일반 문장 전체를 무작정 수정하지 않고
  // $...$ 내부의 수식만 보정합니다.
  return str.replace(/\$([^$]*)\$/g, (_match, mathContent: string) => {
    let math = mathContent;

    // 역슬래시가 빠진 LaTeX 명령어
    // 예: frac{3}{5} -> \frac{3}{5}
    math = math.replace(
      /(?<![a-zA-Z\\])(frac|times|div|pm|left|right|sqrt|pi|neq)/g,
      "\\$1"
    );

    // 중괄호가 빠진 간단한 분수
    // 예: \frac35 -> \frac{3}{5}
    math = math.replace(
      /\\frac\s*([0-9])\s*([0-9])(?![0-9])/g,
      "\\frac{$1}{$2}"
    );

    // 예: \frac1825 -> \frac{18}{25}
    // 주의: 숫자 해석이 애매한 경우가 있으므로
    // $...$ 수식 내부에서만 제한적으로 적용합니다.
    math = math.replace(
      /\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g,
      "\\frac{$1}{$2}"
    );

    return `$${math}$`;
  });
}

// ============================================================
// 객체 전체 수식 보정
// ============================================================

function fixMathInObject(obj: any): any {
  if (typeof obj === "string") {
    return fixMath(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => fixMathInObject(item));
  }

  if (obj !== null && typeof obj === "object") {
    const newObj: any = {};

    for (const key in obj) {
      newObj[key] = fixMathInObject(obj[key]);
    }

    return newObj;
  }

  return obj;
}

// ============================================================
// JSON 파싱
// ============================================================

function safeJsonParse(rawText: string): AnalyzeResponse {
  let cleanText = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

  // 중요:
  // 이전 코드의
  //
  // cleanText.replace(/\\/g, "\\\\")
  //
  // 는 제거합니다.
  //
  // JSON 전체의 백슬래시를 강제로 바꾸면
  // LaTeX의 \frac, \times 등이 오염될 수 있습니다.

  const parsedData = JSON.parse(cleanText);

  return fixMathInObject(parsedData) as AnalyzeResponse;
}

// ============================================================
// 정답 비교용 문자열 정규화
// ============================================================

function normalizeAnswer(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let result = String(value).trim();

  // Markdown / LaTeX wrapper 제거
  result = result
    .replace(/^\$+/, "")
    .replace(/\$+$/, "")
    .trim();

  // \left, \right 제거
  result = result
    .replace(/\\left/g, "")
    .replace(/\\right/g, "");

  // 공백 제거
  result = result.replace(/\s+/g, "");

  // Unicode minus -> 일반 minus
  result = result.replace(/[−–—]/g, "-");

  // "정답: 2", "답: 2" 형태
  result = result.replace(
    /^(정답|답)\s*[:：=]\s*/i,
    ""
  );

  // 예:
  // a=2
  // x=10
  //
  // 단일 등식인 경우 오른쪽 값만 추출
  const equalCount = (result.match(/=/g) || []).length;

  if (equalCount === 1) {
    const equalIndex = result.lastIndexOf("=");

    if (equalIndex !== -1 && equalIndex < result.length - 1) {
      result = result.substring(equalIndex + 1);
    }
  }

  // \frac{3}{5}와 frac{3}{5} 정도의 표현 차이를 줄이기 위한 처리
  result = result.replace(
    /\\frac\{([^{}]+)\}\{([^{}]+)\}/g,
    "($1)/($2)"
  );

  result = result.replace(
    /frac\{([^{}]+)\}\{([^{}]+)\}/g,
    "($1)/($2)"
  );

  return result;
}

// ============================================================
// 정답 ↔ 풀이 불일치 검사
// ============================================================

interface AnswerMismatch {
  index: number;
  correctAnswer: string;
  finalAnswer: string;
  normalizedCorrect: string;
  normalizedFinal: string;
}

function findAnswerMismatches(
  data: AnalyzeResponse
): AnswerMismatch[] {
  const mismatches: AnswerMismatch[] = [];

  if (!Array.isArray(data.problems)) {
    return mismatches;
  }

  data.problems.forEach((problem, index) => {
    const correct = normalizeAnswer(problem.correct_answer);
    const final = normalizeAnswer(problem.final_answer);

    // final_answer가 없거나 서로 다르면 검증 대상으로 처리
    if (!correct || !final || correct !== final) {
      mismatches.push({
        index,
        correctAnswer: problem.correct_answer ?? "",
        finalAnswer: problem.final_answer ?? "",
        normalizedCorrect: correct,
        normalizedFinal: final,
      });
    }
  });

  return mismatches;
}

// ============================================================
// grade 모드의 학생 답안 재판정
// ============================================================

function recalculateGrade(problem: Problem): void {
  if (!problem.student_answer) {
    return;
  }

  const studentAnswer = normalizeAnswer(problem.student_answer);
  const correctAnswer = normalizeAnswer(problem.correct_answer);

  if (
    studentAnswer === "미작성" ||
    studentAnswer === "판독불가" ||
    studentAnswer === ""
  ) {
    problem.is_correct = false;
    return;
  }

  problem.is_correct = studentAnswer === correctAnswer;
}

// ============================================================
// 1차 분석 프롬프트
// ============================================================

function buildMainPrompt(mode: AnalyzeMode): string {
  return `
당신은 대한민국 초·중등 수학 교육과정 전문 AI 홈코치이자
엄격한 수학 검수관입니다.

첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어
오직 순수 JSON 형식으로만 답변하세요.

==================================================
[가장 중요한 수학 풀이 원칙]
==================================================

1. 문제의 모든 조건을 정확하게 읽으세요.

2. 그래프, 좌표, 표, 그림, 식, 보기 등 이미지에 있는 정보를
   필요한 경우 모두 활용하세요.

3. 문제에서 요구하는 값을 정확하게 확인하세요.

4. 절대로 문제에서 주어진 값 자체를 정답으로 착각하지 마세요.

5. 풀이의 마지막 계산 결과가 실제 정답입니다.

6. correct_answer는 문제를 읽은 후 추측해서 작성하지 마세요.

7. 반드시 solution_steps의 계산을 끝까지 완료한 다음
   마지막 결과를 final_answer에 작성하세요.

8. correct_answer와 final_answer는 반드시 동일한 정답을 의미해야 합니다.

9. 특히 다음과 같은 오류를 절대로 만들지 마세요.

   문제:
   "교점 P의 x좌표가 -2일 때 a의 값을 구하시오."

   풀이:
   x=-2
   y=1
   1=-a/(-2)
   a=2

   올바른 결과:
   "final_answer": "2"
   "correct_answer": "2"

   잘못된 결과:
   "final_answer": "2"
   "correct_answer": "-2"

10. 최종 JSON을 작성하기 직전에 반드시 스스로 검산하세요.

   [검산]
   - 문제에서 요구하는 값은 무엇인가?
   - solution_steps의 마지막 계산 결과는 무엇인가?
   - final_answer는 그 결과와 같은가?
   - correct_answer는 final_answer와 같은가?

==================================================
[단계별 풀이]
==================================================

1. solution_steps에는 완성된 정석 풀이만 작성하세요.

2. "잠시만요", "다시 확인하면",
   "~라고 생각하기 쉽지만" 등의 내부 고민 과정은 쓰지 마세요.

3. 계산 과정을 생략하지 마세요.

4. 등식이 포함된 수식은 하나의 $...$ 안에 작성하세요.

5. 보기 대입 풀이도 각각 하나의 완전한 수식으로 작성하세요.

==================================================
[학생 답안 스캔 및 채점]
==================================================

grade 모드일 경우에만 적용하세요.

1. 이미지 내의 모든 문제를 순서대로 식별하세요.

2. 인쇄된 문제지 텍스트와 학생이 직접 작성한 손글씨를
   정확하게 구분하세요.

3. 인쇄체 텍스트를 student_answer로 수집하지 마세요.

4. 학생 손글씨/표시가 전혀 없는 경우:

   "student_answer": "미작성"
   "is_correct": false
   "error_analysis":
   "문제지에 답안 표기가 없습니다. 직접 풀이 후 다시 촬영해 주세요."

5. 답안이 흐리거나 가려져 판독할 수 없는 경우:

   "student_answer": "판독불가"
   "is_correct": false

6. 학생의 명확한 답안이 존재하는 경우에만
   correct_answer와 비교하여 채점하세요.

==================================================
[해설지 / 정답지 판별]
==================================================

이미지가 학생 문제지가 아니라 해설지 또는 정답지인 경우:

"student_answer": "미작성"
"is_correct": false
"error_analysis":
"해설지 이미지가 감지되었습니다. 학생이 풀이한 문제지 이미지를 다시 올려주세요."

==================================================
[중등 수학 기하/그래프 문제]
==================================================

1. 그래프의 개형과 좌표 조건을 정확하게 읽으세요.

2. 교점 문제에서는 교점이 두 그래프의 식을 동시에 만족한다는 점을
   반드시 이용하세요.

3. 문제에서 특정 점의 x좌표 또는 y좌표가 주어진 경우,
   그 값이 최종 정답인지 문제에서 추가로 구해야 하는 값인지
   정확하게 구분하세요.

4. "x좌표가 -2일 때 a의 값을 구하시오"와 같은 문제에서는
   -2를 정답으로 그대로 출력하지 말고,
   실제로 구해야 하는 a를 계산하세요.

==================================================
[수식 및 LaTeX]
==================================================

1. 모든 수식은 반드시 $...$로 감싸세요.

2. 분수는 반드시 다음처럼 작성하세요.

   "$\\\\frac{3}{5}$"

3. 다음처럼 작성하지 마세요.

   "frac35"
   "frac{3}{5}"

4. 곱셈 기호는 반드시 "\\\\times"를 사용하세요.

5. 올바른 예:

   "$y = -\\\\frac{1}{2} \\\\times (-2) = 1$"

==================================================
[필드 의미]
==================================================

final_answer:
- solution_steps의 마지막 계산 결과
- 문제에서 실제로 요구하는 값
- 정답 검증용 필드

correct_answer:
- final_answer와 동일한 실제 정답
- final_answer와 다른 값을 절대로 작성하지 마세요.

==================================================
`;
}

// ============================================================
// 재검증 프롬프트
// ============================================================

function buildVerificationPrompt(
  mode: AnalyzeMode,
  problem: Problem
): string {
  return `
당신은 수학 풀이 검증 전문 AI입니다.

원본 문제 이미지와 아래의 기존 AI 분석 결과를 함께 확인하세요.

중요:
기존 AI의 correct_answer를 절대로 신뢰하지 마세요.
반드시 원본 이미지의 문제를 다시 읽고 직접 계산하여 검증하세요.

==================================================
[기존 AI 분석]
==================================================

${JSON.stringify(problem, null, 2)}

==================================================
[검증 절차]
==================================================

1. 원본 이미지에서 문제의 요구사항을 다시 확인하세요.

2. 문제에 주어진 조건을 정확하게 확인하세요.

3. 기존 solution_steps의 계산을 처음부터 다시 검산하세요.

4. 실제 최종 정답을 독립적으로 다시 계산하세요.

5. 특히 다음 두 값을 반드시 확인하세요.

   - 문제에서 실제로 구하라고 한 값
   - 기존 AI가 답으로 사용한 값

6. 문제에서 x=-2라고 주어졌더라도
   "a의 값을 구하시오"라고 되어 있다면
   정답은 x=-2가 아니라 계산한 a의 값입니다.

7. 검증된 최종 결과를 final_answer에 작성하세요.

8. correct_answer에는 final_answer와 동일한 값을 작성하세요.

9. 기존 풀이가 잘못되었다면 solution_steps도 올바른 풀이로 수정하세요.

==================================================
[수식 규칙]
==================================================

모든 수식은 $...$로 감싸세요.

분수는 반드시:
"$\\\\frac{3}{5}$"

형태로 작성하세요.

==================================================
[최종 검증]
==================================================

final_answer와 correct_answer가 의미상 동일해야 합니다.

오류가 발견되었다면 corrected 값을 반환하세요.
`;
}

// ============================================================
// 재검증 결과 타입
// ============================================================

interface VerificationResult {
  correct_answer: string;
  final_answer: string;
  solution_steps: string[];
  error_analysis?: string;
}

// ============================================================
// Gemini 분석 실행
// ============================================================

async function generateAnalysis(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string,
  imagePart: any
): Promise<AnalyzeResponse> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const result = await model.generateContent([
    prompt,
    imagePart,
  ]);

  const responseText = result.response.text();

  console.log(
    "================ [AI Raw Response] ================"
  );
  console.log(responseText);
  console.log(
    "=================================================="
  );

  return safeJsonParse(responseText);
}

// ============================================================
// 불일치 문제 재검증
// ============================================================

async function revalidateProblem(
  genAI: GoogleGenerativeAI,
  imagePart: any,
  mode: AnalyzeMode,
  problem: Problem
): Promise<VerificationResult | null> {
  const prompt = buildVerificationPrompt(mode, problem);

  let lastError: any = null;

  for (const modelName of VERIFIER_MODELS) {
    try {
      console.log(
        `[정답 재검증] 모델: ${modelName}, 문제: ${problem.problem_number}`
      );

      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.0,
        },
      });

      const result = await model.generateContent([
        prompt,
        imagePart,
      ]);

      const responseText = result.response.text();

      console.log(
        "================ [Verifier Raw Response] ================"
      );
      console.log(responseText);
      console.log(
        "========================================================="
      );

      const parsed = safeJsonParse(responseText) as any;

      if (
        !parsed ||
        typeof parsed.correct_answer !== "string" ||
        typeof parsed.final_answer !== "string" ||
        !Array.isArray(parsed.solution_steps)
      ) {
        throw new Error(
          "재검증 응답에 필수 필드가 없습니다."
        );
      }

      return {
        correct_answer: parsed.correct_answer,
        final_answer: parsed.final_answer,
        solution_steps: parsed.solution_steps,
        error_analysis: parsed.error_analysis,
      };
    } catch (error: any) {
      lastError = error;

      console.error(
        `[정답 재검증 실패] ${modelName}:`,
        error?.message
      );
    }
  }

  console.error(
    "[정답 재검증 최종 실패]:",
    lastError?.message
  );

  return null;
}

// ============================================================
// POST
// ============================================================

export async function POST(req: NextRequest) {
  try {
    // ----------------------------------------------------------
    // 1. FormData
    // ----------------------------------------------------------

    const formData = await req.formData();

    const imageFile = formData.get("image") as Blob | null;

    const rawMode = formData.get("mode") as string | null;

    const mode: AnalyzeMode =
      rawMode === "guide" ? "guide" : "grade";

    // ----------------------------------------------------------
    // 2. 이미지 검사
    // ----------------------------------------------------------

    if (!imageFile) {
      return NextResponse.json(
        {
          error: "이미지가 전송되지 않았습니다.",
        },
        {
          status: 400,
        }
      );
    }

    // ----------------------------------------------------------
    // 3. API Key
    // ----------------------------------------------------------

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY 환경변수가 설정되지 않았습니다.",
        },
        {
          status: 500,
        }
      );
    }

    // ----------------------------------------------------------
    // 4. Gemini 초기화
    // ----------------------------------------------------------

    const genAI = new GoogleGenerativeAI(apiKey);

    // ----------------------------------------------------------
    // 5. 이미지 변환
    // ----------------------------------------------------------

    const arrayBuffer = await imageFile.arrayBuffer();

    const base64Data =
      Buffer.from(arrayBuffer).toString("base64");

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: imageFile.type || "image/jpeg",
      },
    };

    // ----------------------------------------------------------
    // 6. 메인 분석
    // ----------------------------------------------------------

    const prompt = buildMainPrompt(mode);

    let lastError: any = null;

    let parsedData: AnalyzeResponse | null = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(
          `[AI 분석 시도] 모델: ${modelName}`
        );

        parsedData = await generateAnalysis(
          genAI,
          modelName,
          prompt,
          imagePart
        );

        console.log(
          "================ [Parsed JSON Data] ================"
        );

        console.log(
          JSON.stringify(parsedData, null, 2)
        );

        console.log(
          "==================================================="
        );

        break;
      } catch (err: any) {
        lastError = err;

        console.error(
          `[AI 분석 실패] ${modelName}:`,
          err?.message
        );
      }
    }

    // ----------------------------------------------------------
    // 7. 메인 분석 실패
    // ----------------------------------------------------------

    if (!parsedData) {
      return NextResponse.json(
        {
          error: "분석 실패",
          details: lastError?.message,
        },
        {
          status: 500,
        }
      );
    }

    // ----------------------------------------------------------
    // 8. ★ 정답 ↔ 풀이 불일치 자동 검출
    // ----------------------------------------------------------

    const mismatches =
      findAnswerMismatches(parsedData);

    console.log(
      "================ [Answer Validation] ================"
    );

    if (mismatches.length === 0) {
      console.log(
        "정답-풀이 불일치 없음"
      );
    } else {
      console.warn(
        `정답-풀이 불일치 ${mismatches.length}건 발견`
      );

      for (const mismatch of mismatches) {
        console.warn(
          `[${parsedData.problems[mismatch.index].problem_number}]`,
          {
            correctAnswer: mismatch.correctAnswer,
            finalAnswer: mismatch.finalAnswer,
            normalizedCorrect:
              mismatch.normalizedCorrect,
            normalizedFinal:
              mismatch.normalizedFinal,
          }
        );
      }
    }

    console.log(
      "======================================================"
    );

    // ----------------------------------------------------------
    // 9. ★ 불일치 문제만 Gemini 재검증
    // ----------------------------------------------------------

    for (const mismatch of mismatches) {
      const index = mismatch.index;

      const originalProblem =
        parsedData.problems[index];

      console.log(
        `\n[정답 재검증 시작] ${originalProblem.problem_number}`
      );

      const verification =
        await revalidateProblem(
          genAI,
          imagePart,
          mode,
          originalProblem
        );

      if (!verification) {
        console.warn(
          `[정답 재검증 실패] 기존 결과 유지: ${originalProblem.problem_number}`
        );

        continue;
      }

      // --------------------------------------------------------
      // 10. 재검증 결과 반영
      // --------------------------------------------------------

      console.log(
        `[정답 재검증 결과] ${originalProblem.problem_number}`,
        {
          beforeCorrectAnswer:
            originalProblem.correct_answer,

          beforeFinalAnswer:
            originalProblem.final_answer,

          afterCorrectAnswer:
            verification.correct_answer,

          afterFinalAnswer:
            verification.final_answer,
        }
      );

      originalProblem.correct_answer =
        verification.correct_answer;

      originalProblem.final_answer =
        verification.final_answer;

      originalProblem.solution_steps =
        verification.solution_steps;

      // grade 모드라면 정답 변경 후 채점도 다시 계산
      if (mode === "grade") {
        recalculateGrade(originalProblem);

        // 재검증 모델이 error_analysis를 제공한 경우
        // 기존 분석보다 우선 사용
        if (verification.error_analysis) {
          originalProblem.error_analysis =
            verification.error_analysis;
        }
      }
    }

    // ----------------------------------------------------------
    // 11. 최종 수식 보정
    // ----------------------------------------------------------

    parsedData = fixMathInObject(
      parsedData
    ) as AnalyzeResponse;

    // ----------------------------------------------------------
    // 12. 최종 정답-풀이 검증 로그
    // ----------------------------------------------------------

    const finalMismatches =
      findAnswerMismatches(parsedData);

    console.log(
      "================ [Final Answer Validation] ================"
    );

    if (finalMismatches.length === 0) {
      console.log(
        "✅ 모든 문제의 correct_answer와 final_answer가 일치합니다."
      );
    } else {
      console.error(
        "⚠️ 재검증 후에도 정답-풀이 불일치가 남아 있습니다."
      );

      for (const mismatch of finalMismatches) {
        console.error(
          parsedData.problems[mismatch.index].problem_number,
          mismatch
        );
      }
    }

    console.log(
      "============================================================"
    );

    // ----------------------------------------------------------
    // 13. 내부 검증용 final_answer 제거 여부
    // ----------------------------------------------------------
    //
    // 프론트에서 final_answer를 사용할 필요가 없다면
    // 아래 코드를 활성화하세요.
    //
    // parsedData.problems.forEach((problem) => {
    //   delete problem.final_answer;
    // });
    //
    // 현재는 디버깅 및 검증을 위해 그대로 반환합니다.
    // ----------------------------------------------------------

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error(
      "[analyze API Error]",
      error
    );

    return NextResponse.json(
      {
        error: error?.message || "알 수 없는 오류",
      },
      {
        status: 500,
      }
    );
  }
}