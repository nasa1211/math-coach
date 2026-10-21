// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { SESSION_COOKIE, sessionMatches } from "@/lib/accessSession";
import { ANALYSIS_FAILED_ERROR, ANALYSIS_FORMAT_ERROR, analysisProblems } from "@/lib/analysisResult";
import { ANALYSIS_TIMEOUT_MESSAGE, SERVER_ANALYSIS_TIMEOUT_MS } from "@/lib/analysisTimeout";
import { buildAnalyzePrompt, parseAnalysisMode } from "@/lib/analyzePrompt";
import { MODEL_ID, parseModelChoice, type ModelChoice } from "@/lib/modelChoice";
import { isModelTimeout } from "@/lib/modelTimeout";
import { collectLogSecrets, sanitizeForLog, usageFields } from "@/lib/safeLog";
import { MAX_IMAGE_SIZE, RATE_LIMITS } from "@/lib/constants";
import { validateServerEnv } from "@/lib/envValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { withGeminiRetry } from "@/lib/geminiRetry";

const MODEL_BY_CHOICE: Record<ModelChoice, { id: string; generationConfig: GenerationConfig }> = {
  pro: {
    id: MODEL_ID.pro,
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "medium" },
    } as GenerationConfig,
  },
  flash: {
    id: MODEL_ID.flash,
    generationConfig: {
      responseMimeType: "application/json",
    },
  },
};

export const maxDuration = 60;

type AnswerPart = { text?: string; thought?: boolean };

function visibleAnswerText(response: {
  text: () => string;
  candidates?: Array<{ content?: { parts?: AnswerPart[] } }>;
}): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return response.text();

  const answer = parts
    .filter((part) => part.thought !== true && part.text)
    .map((part) => part.text)
    .join("");

  return answer || response.text();
}

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

function fixMathInObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return fixMath(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => fixMathInObject(item));
  }
  if (obj !== null && typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = fixMathInObject((obj as Record<string, unknown>)[key]);
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
    // Rate limiting 체크
    const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.ANALYZE);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 환경 변수 검증 (조기 실패)
    const { GEMINI_API_KEY, ACCESS_PASSCODE } = validateServerEnv();

    const jar = await cookies();
    if (!sessionMatches(jar.get(SESSION_COOKIE)?.value, ACCESS_PASSCODE)) {
      return NextResponse.json(
        { error: "로그인이 필요합니다. 접근 암호를 다시 입력해 주세요." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get("image") as Blob | null;
    const mode = parseAnalysisMode(formData.get("mode"));
    const modelChoice = parseModelChoice(formData.get("modelChoice"));
    const selectedModel = MODEL_BY_CHOICE[modelChoice];

    if (!imageFile) {
      return NextResponse.json({ error: "이미지가 전송되지 않았습니다." }, { status: 400 });
    }

    if (imageFile.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: `이미지가 너무 큽니다 (최대 ${Math.round(MAX_IMAGE_SIZE / 1024 / 1024)}MB). 문제 영역만 잘라 다시 올려 주세요.` },
        { status: 400 }
      );
    }

    if (imageFile.type && !imageFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 분석할 수 있습니다." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: imageFile.type || "image/jpeg",
      },
    };

    const prompt = buildAnalyzePrompt(mode);

    const model = genAI.getGenerativeModel(
      {
        model: selectedModel.id,
        generationConfig: selectedModel.generationConfig,
      },
      { timeout: SERVER_ANALYSIS_TIMEOUT_MS },
    );

    // 재시도 로직 적용
    const result = await withGeminiRetry(
      () => model.generateContent([prompt, imagePart]),
      { operationName: "analyze_image" }
    );
    const responseText = visibleAnswerText(result.response);
    const parsedData = safeJsonParse(responseText);
    const problems = analysisProblems(parsedData);
    const usage = usageFields(result.response.usageMetadata);
    if (!problems || !parsedData || typeof parsedData !== "object" || Array.isArray(parsedData)) {
      console.info(JSON.stringify({ event: "analyze_format_error", model: selectedModel.id, ...usage }));
      return NextResponse.json({ error: ANALYSIS_FORMAT_ERROR }, { status: 502 });
    }

    console.info(
      JSON.stringify({
        event: "analyze_complete",
        model: selectedModel.id,
        problemCount: problems.length,
        ...usage,
      }),
    );
    return NextResponse.json({ ...parsedData, mode, problems, modelUsed: selectedModel.id });
  } catch (error: unknown) {
    console.error(sanitizeForLog(error, collectLogSecrets()));
    if (isModelTimeout(error)) {
      return NextResponse.json({ error: ANALYSIS_TIMEOUT_MESSAGE }, { status: 504 });
    }
    return NextResponse.json({ error: ANALYSIS_FAILED_ERROR }, { status: 500 });
  }
}