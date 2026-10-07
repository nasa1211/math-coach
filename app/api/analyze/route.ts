// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { readAccessPasscode, SESSION_COOKIE, sessionMatches } from "@/lib/accessSession";
import { ANALYSIS_FAILED_ERROR, ANALYSIS_FORMAT_ERROR, analysisProblems } from "@/lib/analysisResult";
import { buildAnalyzePrompt, parseAnalysisMode } from "@/lib/analyzePrompt";
import { parseModelChoice, type ModelChoice } from "@/lib/modelChoice";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MODEL_BY_CHOICE: Record<ModelChoice, { id: string; generationConfig: GenerationConfig }> = {
  pro: {
    id: "gemini-3.1-pro-preview",
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "medium" },
    } as GenerationConfig,
  },
  flash: {
    id: "gemini-3.8-flash",
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "high" },
    } as GenerationConfig,
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

    const formData = await req.formData();
    const imageFile = formData.get("image") as Blob | null;
    const mode = parseAnalysisMode(formData.get("mode"));
    const modelChoice = parseModelChoice(formData.get("modelChoice"));
    const selectedModel = MODEL_BY_CHOICE[modelChoice];

    if (!imageFile) {
      return NextResponse.json({ error: "이미지가 전송되지 않았습니다." }, { status: 400 });
    }

    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "이미지가 너무 큽니다. 문제 영역만 잘라 다시 올려 주세요." },
        { status: 400 }
      );
    }

    if (imageFile.type && !imageFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 분석할 수 있습니다." }, { status: 400 });
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

    const prompt = buildAnalyzePrompt(mode);

    const model = genAI.getGenerativeModel({
      model: selectedModel.id,
      generationConfig: selectedModel.generationConfig,
    });

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = visibleAnswerText(result.response);
    const parsedData = safeJsonParse(responseText);
    const problems = analysisProblems(parsedData);
    if (!problems) {
      return NextResponse.json({ error: ANALYSIS_FORMAT_ERROR }, { status: 502 });
    }

    return NextResponse.json({ ...parsedData, mode, problems, modelUsed: selectedModel.id });
  } catch (error: unknown) {
    console.error("분석 실패:", error);
    return NextResponse.json({ error: ANALYSIS_FAILED_ERROR }, { status: 500 });
  }
}