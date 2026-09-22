// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CANDIDATE_MODELS = [
  "gemini-2.5-pro",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

// --- [수식 교정 엔진] ---
function fixMath(str: string) {
  if (typeof str !== "string") return str;
  let res = str;

  // 1. 역슬래시가 없는 키워드 보정 (예: frac{3}{5} -> \frac{3}{5})
  res = res.replace(/(?<![a-zA-Z\\])(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "\\$1");

  // 2. 중괄호 빠진 분수 보정
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
첨부된 이미지를 정밀 분석하여 요청된 모드("${mode}")에 맞추어 오직 순수 JSON 형식으로만 답변하세요. 다른 설명이나 마크다운 백틱(\`\`\`json)은 절대로 포함하지 마세요.

==================================================
[단계별 풀이 및 정답 도출 원칙 - 필수 준수]
==================================================
1. 먼저 문제의 조건과 대입 연산을 통해 수학적 결과를 차근차근 풀이(solution_steps)하세요.
   - 문제 지문에 등장하는 단순 조건 숫자(예: x좌표 -2)나 이미지 하단의 입력란 번호(예: '1번 :')를 정답으로 오인하여 그대로 출력하지 마세요.
   - 예: $1 = -\\frac{a}{-2} \\implies 1 = \\frac{a}{2} \\implies a = 2$ (최종 계산 결과가 2이면 정답은 지문의 -2가 아니라 반드시 "2"입니다.)
   - 절대로 그래프의 개형이나 사분면 위치 조건을 복잡하게 오버생각(Over-thinking)하여 명확한 대입 계산 결과를 왜곡하지 마세요.

2. solution_steps 작성 시 주의사항:
   - "잠시만요", "다시 확인하면", "~라고 생각하기 쉽지만" 등 AI 내부의 혼란이나 혼잣말 표현은 절대로 포함하지 말고, 깔끔한 정석 해설만 1단계부터 작성하세요.

3. [정답 매핑 절대 규칙]:
   - 반드시 solution_steps의 마지막 단계에서 수학적으로 최종 확정된 결과값만 'correct_answer'에 정확히 입력하세요.
   - solution_steps의 결론과 correct_answer의 값은 절대로 서로 다르면 안 됩니다.
   - 단일 정답인 경우: "2" 또는 "④"
   - 정답이 2개 이상(복수 정답)인 경우: "④, ⑤" (쉼표로 구분하여 모두 표기)

==================================================
[학생 답안 스캔 및 채점 판정 - 최우선 절대 규칙]
==================================================
1. 이미지 내의 모든 문제를 순서대로 식별하세요.
2. 각 문제 채점 전, 아래 [0단계]를 최우선으로 검사하세요:

  0단계 [문서 유형 및 해설지 판별 - 최우선 가드레일]:
    - 첨부된 이미지가 문제 번호 옆에 정답(예: 8) ①, 9) ②) 및 상세 풀이가 인쇄 텍스트로 완성되어 있는 '해설지/정답지'인 경우:
      * 학생의 손글씨 작성본이 아니므로 이미지 내 모든 문항에 대해 아래와 같이 일괄 처리하고 채점을 중단하세요:
      * "student_answer": "미작성"
      * "is_correct": false
      * "error_analysis": "해설지 이미지가 감지되었습니다. 학생이 풀이한 문제지 이미지를 다시 올려주세요."

  1단계 [손글씨/표시 스캔 (일반 문제지일 경우)]:
    - 인쇄된 문제지 텍스트와 학생이 연필, 펜, 색연필 등으로 직접 작성한 손글씨(숫자, 기호, 동그라미, 체크 표시 등)를 정밀하게 구분하세요.
    - 인쇄체 텍스트는 절대로 학생 답안("student_answer")으로 수집하지 마세요.

  2단계 [답안 존재 여부 판단]:
    - **학생 손글씨/표시가 전혀 없는 경우**:
      * "student_answer": "미작성"
      * "is_correct": false
      * "error_analysis": "문제지에 답안 표기가 없습니다. 직접 풀이 후 다시 촬영해 주세요."
    - **지우개 자국만 있거나 손가락/빛 반사 등으로 답안을 전혀 알아볼 수 없는 경우**:
      * "student_answer": "판독불가"
      * "is_correct": false
      * "error_analysis": "답안이 흐리거나 가려져 읽을 수 없습니다. 다시 명확히 작성해 주세요."

  3단계 [실제 채점 진행]:
    - **학생의 명확한 답안 표기가 존재하는 경우에만** 해당 답을 읽어 정답과 비교 채점합니다.
    - 학생 작성 답안이 복수 정답 중 일부만 포함하거나 오답이면 "is_correct": false 처리합니다.
    - 실제 정답과 완전히 일치하면 "is_correct": true 로 처리합니다.

※ 절대 주의: 작성되지 않은 답안을 임의로 추측하거나 정답 처리하는 환각(Hallucination)을 엄격히 금지합니다.

==================================================
[중등 수학 기하/작도/명제 문제 검수 특이사항]
==================================================
1. 공간에서의 위치 관계(직선과 평면) 명제 판단 시 반례(평행, 일치 등)가 존재하는지 엄격히 검증하세요.
   - 예: "공간에서 만나지 않는 두 직선 = 꼬인 위치" (❌ 거짓 - '평행' 반례 존재)
   - 예: "엇각의 크기는 항상 같다" (❌ 거짓 - '두 직선이 평행할 때만' 성립)

2. 평행선 및 꺾인 선 각도 문제:
   - 꺾인 지점에 보조선을 그어 엇각/동위각 관계를 정확히 계산한 후, 구한 값과 적용된 성질((가) 또는 (나))이 모두 일치하는 선택지 번호를 정확히 매핑하세요.

3. 삼각형의 작도 문제:
   - 작도 과정 지문의 괄호 숫자 ①~⑤와 하단의 보기 선택지 ①~⑤는 별개입니다.
   - 괄호 안에 들어갈 구체적인 점, 변, 각의 명칭을 명확히 추론한 후, 하단 보기 중 '옳지 않은 것'을 선택하세요. (예: 작도할 각은 $\\angle XBY$ 또는 $\\angle B$이므로 $\\angle BAC$라고 표기된 보기가 오답)

==================================================
[수식 및 LaTeX 작성 원칙 - $ 감싸기 및 이중 이스케이프 필수]
==================================================
1. [가장 중요] 정답(correct_answer), 풀이(solution_steps), 지문 등 **모든 수식 기호/분수 표현은 반드시 달러 기호($...$)로 감싸서 작성**하세요.
   - ❌ 잘못된 예: "correct_answer": "\\\\frac{3}{4}" (달러 기호가 없으면 화면 렌더링 실패)
   - ⭕ 올바른 예: "correct_answer": "$\\\\frac{3}{4}$"

2. 분수를 작성할 때 역슬래시와 중괄호를 생략하지 마세요. (JSON 이스케이프 준수)
   - ⭕ 올바른 예: "$\\\\frac{3}{4}$", "$y = -\\\\frac{6}{5}x$"

3. 곱셈 기호는 "times"가 아니라 반드시 "\\\\times" 로 작성하세요.
   - ⭕ 올바른 예: "$24a = 18 \\\\times 2$"

==================================================
[줄바꿈 및 보기 가독성 가이드]
==================================================
1. 등식이 포함된 수식은 좌/우변을 분리하지 말고 하나의 수식 기호 안($y = \\\\frac{3}{5}x$)에 작성하세요.
2. 풀이 단계(solution_steps)나 보기 풀이 사이에는 반드시 줄바꿈(\\n)을 추가하세요.

==================================================
[JSON 반환 스키마]
==================================================
{
  "mode": "${mode}",
  "problems": [
    {
      "problem_number": "문항 번호 (예: 29번)",
      "problem_text": "문제 지문 요약",
      "solution_steps": ["1단계 풀이 과정", "2단계 대입 및 계산", "3단계: 따라서 a = 2입니다."],
      "correct_answer": "solution_steps에서 최종 도출된 정확한 값 (예: '2')",
      "concept": "단원 및 핵심 개념",
      ${
        mode === "guide"
          ? `"teaching_tip": "부모님 사전 지도 팁 및 함정 요소"`
          : `"student_answer": "학생 작성 답안 (또는 '미작성' / '판독불가')",
             "is_correct": false,
             "error_analysis": "오답 원인 분석 (또는 미작성 안내)",
             "parent_script": ["아이에게 전할 코칭 대화 1", "코칭 대화 2"],
             "twin_problem": {
               "question": "유사 쌍둥이 문제",
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
            temperature: 0.1,
          },
        });

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        console.log("================ [AI Raw Response] ================");
        console.log(responseText);
        console.log("==================================================");

        parsedData = safeJsonParse(responseText);

        console.log("================ [Parsed JSON Data] ================");
        console.log(JSON.stringify(parsedData, null, 2));
        console.log("===================================================");
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