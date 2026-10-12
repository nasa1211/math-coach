import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { readAccessPasscode, SESSION_COOKIE, sessionMatches } from "@/lib/accessSession";
import {
  DIAGNOSIS_FAILED_ERROR,
  DIAGNOSIS_FORMAT_ERROR,
  buildDiagnosisPrompt,
  parseDiagnosisReport,
} from "@/lib/diagnosisReport";
import { parseModelChoice, type ModelChoice } from "@/lib/modelChoice";
import type { WrongNote } from "@/lib/wrongNote";

export const maxDuration = 60;

const MODEL_BY_CHOICE: Record<ModelChoice, { id: string; generationConfig: GenerationConfig }> = {
  pro: {
    id: "gemini-3.1-pro-preview",
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "medium" },
    } as GenerationConfig,
  },
  flash: {
    id: "gemini-3.6-flash",
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
    const passcode = readAccessPasscode();
    if (!passcode) {
      return NextResponse.json(
        { error: "서버 접근 암호(ACCESS_PASSCODE)가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const jar = await cookies();
    if (!sessionMatches(jar.get(SESSION_COOKIE)?.value, passcode)) {
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }, { status: 500 });
    }

    const modelChoice = parseModelChoice(body?.modelChoice);
    const selectedModel = MODEL_BY_CHOICE[modelChoice];
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: selectedModel.id,
      generationConfig: selectedModel.generationConfig,
    });

    const result = await model.generateContent(buildDiagnosisPrompt(wrongs));
    const report = parseDiagnosisReport(safeJsonParse(visibleAnswerText(result.response)));
    if (!report) {
      return NextResponse.json({ error: DIAGNOSIS_FORMAT_ERROR }, { status: 502 });
    }

    return NextResponse.json({ ...report, modelUsed: selectedModel.id });
  } catch (error: unknown) {
    console.error("학습 진단 실패:", error);
    return NextResponse.json({ error: DIAGNOSIS_FAILED_ERROR }, { status: 500 });
  }
}
