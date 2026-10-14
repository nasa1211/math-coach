import { parseDiagnosisReport, type DiagnosisReport } from "@/lib/diagnosisReport";
import { storageFailureMessage, type SaveResult } from "@/lib/storageFailure";
import type { WrongNote } from "@/lib/wrongNote";

export const DIAGNOSIS_CACHE_KEY = "math_coach_diagnosis_cache_v1";
const CACHE_LIMIT = 8;

export interface DiagnosisCacheIdentity {
  modelId: string;
  promptVersion: string;
  notes: WrongNote[];
}

interface CacheEntry {
  key: string;
  report: DiagnosisReport;
  savedAt: number;
}

export function diagnosisCachePayload(identity: DiagnosisCacheIdentity): string {
  return JSON.stringify({
    modelId: identity.modelId,
    promptVersion: identity.promptVersion,
    notes: identity.notes.map((note) => ({
      problem_number: note.problem_number,
      problem_text: note.problem_text,
      concept: note.concept,
      student_answer: note.student_answer,
      correct_answer: note.correct_answer,
      error_analysis: note.error_analysis,
      timestamp: note.timestamp,
    })),
  });
}

export async function diagnosisCacheKey(identity: DiagnosisCacheIdentity): Promise<string> {
  const encoded = new TextEncoder().encode(diagnosisCachePayload(identity));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function planDiagnosisRequest(force: boolean, cached: DiagnosisReport | null): "cache" | "request" {
  return !force && cached ? "cache" : "request";
}

function readEntries(): CacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DIAGNOSIS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as { key?: unknown; report?: unknown; savedAt?: unknown };
      if (typeof record.key !== "string") return [];
      const report = parseDiagnosisReport(record.report);
      if (!report) return [];
      return [{ key: record.key, report, savedAt: typeof record.savedAt === "number" ? record.savedAt : 0 }];
    });
  } catch {
    return [];
  }
}

export function readDiagnosisCache(key: string): DiagnosisReport | null {
  return readEntries().find((entry) => entry.key === key)?.report ?? null;
}

export function writeDiagnosisCache(key: string, report: DiagnosisReport): SaveResult {
  const entries = [{ key, report, savedAt: Date.now() }, ...readEntries().filter((entry) => entry.key !== key)].slice(
    0,
    CACHE_LIMIT,
  );
  try {
    localStorage.setItem(DIAGNOSIS_CACHE_KEY, JSON.stringify({ entries }));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "diagnosis") };
  }
}
