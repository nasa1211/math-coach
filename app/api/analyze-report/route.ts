import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { SESSION_COOKIE, sessionMatches } from "@/lib/accessSession";
import { ANALYSIS_TIMEOUT_MESSAGE, SERVER_ANALYSIS_TIMEOUT_MS } from "@/lib/analysisTimeout";
import {
  DIAGNOSIS_FAILED_ERROR,
  DIAGNOSIS_FORMAT_ERROR,
  buildDiagnosisPrompt,
  parseDiagnosisReport,
} from "@/lib/diagnosisReport";
import { MODEL_ID, parseModelChoice, type ModelChoice } from "@/lib/modelChoice";
import { isModelTimeout } from "@/lib/modelTimeout";
import { collectLogSecrets, sanitizeForLog, usageFields } from "@/lib/safeLog";
import type { WrongNote } from "@/lib/wrongNote";
import { RATE_LIMITS } from "@/lib/constants";
import { validateServerEnv } from "@/lib/envValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { withGeminiRetry } from "@/lib/geminiRetry";

export const maxDuration = 60;

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

function fixMath(str: string) {
  if (typeof str !== "string") return str;
  return str
    .replace(/(?<![a-zA-Z\\])(frac|times|div|pm|left|right|sqrt|pi|neq)/g, "\\$1")
    .replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
}

function fixMathInObject(obj: unknown): unknown {
  if (typeof obj === "string") return fixMath(obj);
  if (Array.isArray(obj)) return obj.map((item) => fixMathInObject(item));
  if (obj !== null && typeof obj === "object") {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      next[key] = fixMathInObject((obj as Record<string, unknown>)[key]);
    }
    return next;
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
  try {
    return fixMathInObject(JSON.parse(cleanText));
  } catch {
    const fixedText = cleanText.replace(/\\/g, "\\\\");
    return fixMathInObject(JSON.parse(fixedText));
  }
}

function isWrongNote(value: unknown): value is WrongNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<WrongNote>;
  return typeof note.problem_text === "string" && typeof note.timestamp === "number";
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

    const body = (await req.json().catch(() => null)) as {
      wrongs?: unknown;
      modelChoice?: unknown;
    } | null;
    const wrongs = Array.isArray(body?.wrongs) ? body.wrongs.filter(isWrongNote).slice(0, 40) : [];
    if (wrongs.length === 0) {
      return NextResponse.json(
        { error: "진단할 오답 기록이 없습니다. 채점을 먼저 진행해 주세요." },
        { status: 400 }
      );
    }

    const modelChoice = parseModelChoice(body?.modelChoice);
    const selectedModel = MODEL_BY_CHOICE[modelChoice];
    const model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel(
      {
        model: selectedModel.id,
        generationConfig: selectedModel.generationConfig,
      },
      { timeout: SERVER_ANALYSIS_TIMEOUT_MS },
    );

    // 재시도 로직 적용
    const result = await withGeminiRetry(
      () => model.generateContent(buildDiagnosisPrompt(wrongs)),
      { operationName: "analyze_report" }
    );
    const usage = usageFields(result.response.usageMetadata);
    const report = parseDiagnosisReport(safeJsonParse(visibleAnswerText(result.response)));
    if (!report) {
      console.info(JSON.stringify({ event: "diagnosis_format_error", model: selectedModel.id, noteCount: wrongs.length, ...usage }));
      return NextResponse.json({ error: DIAGNOSIS_FORMAT_ERROR }, { status: 502 });
    }

    console.info(
      JSON.stringify({
        event: "diagnosis_complete",
        model: selectedModel.id,
        noteCount: wrongs.length,
        ...usage,
      }),
    );
    return NextResponse.json({ ...report, modelUsed: selectedModel.id });
  } catch (error: unknown) {
    console.error(sanitizeForLog(error, collectLogSecrets()));
    if (isModelTimeout(error)) {
      return NextResponse.json({ error: ANALYSIS_TIMEOUT_MESSAGE }, { status: 504 });
    }
    return NextResponse.json({ error: DIAGNOSIS_FAILED_ERROR }, { status: 500 });
  }
}
