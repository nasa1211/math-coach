import type { StoredHistoryRecord } from "@/lib/historyStore";

export const HISTORY_EXPORT_TIME_ZONE = "Asia/Seoul";

export interface HistoryExportProblem {
  problem_number: string;
  problem_text: string;
  correct_answer: string;
  solution_steps: string[];
  student_answer?: string;
  is_correct?: boolean;
}

export function historyDateKey(
  timestamp: number,
  timeZone: string = HISTORY_EXPORT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function historyTimeLabel(
  timestamp: number,
  timeZone: string = HISTORY_EXPORT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function collectHistoryDates(records: StoredHistoryRecord[]): string[] {
  const set = new Set<string>();
  for (const record of records) {
    set.add(historyDateKey(record.timestamp));
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function defaultHistoryExportDate(
  dates: string[],
  nowMs: number = Date.now(),
): string {
  const today = historyDateKey(nowMs);
  if (dates.includes(today)) return today;
  if (dates.length > 0) return dates[0];
  return today;
}

export function filterHistoryByDate(
  records: StoredHistoryRecord[],
  dateKey: string,
): StoredHistoryRecord[] {
  return records
    .filter((record) => historyDateKey(record.timestamp) === dateKey)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function modeLabel(mode: StoredHistoryRecord["mode"]): string {
  return mode === "guide" ? "풀이 가이드" : "채점";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseProblem(raw: unknown): HistoryExportProblem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const stepsRaw = item.solution_steps;
  const solution_steps = Array.isArray(stepsRaw)
    ? stepsRaw.map((step) => asString(step)).filter(Boolean)
    : [];
  const problem_number = asString(item.problem_number) || "?";
  const problem_text = asString(item.problem_text);
  const correct_answer = asString(item.correct_answer);
  const student_answer = asString(item.student_answer);
  const parsed: HistoryExportProblem = {
    problem_number,
    problem_text,
    correct_answer,
    solution_steps,
  };
  if (student_answer) parsed.student_answer = student_answer;
  if (typeof item.is_correct === "boolean") parsed.is_correct = item.is_correct;
  return parsed;
}

function formatProblemBlock(problem: HistoryExportProblem): string[] {
  const lines: string[] = [];
  lines.push(`[${problem.problem_number}번]`);
  if (problem.problem_text) lines.push(`문제: ${problem.problem_text}`);
  if (problem.correct_answer) lines.push(`정답: ${problem.correct_answer}`);
  if (problem.solution_steps.length > 0) {
    lines.push("풀이 단계:");
    problem.solution_steps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }
  if (problem.student_answer !== undefined) {
    const verdict =
      problem.is_correct === true
        ? "정답"
        : problem.is_correct === false
          ? "오답"
          : "";
    lines.push(
      verdict
        ? `학생 답: ${problem.student_answer} (${verdict})`
        : `학생 답: ${problem.student_answer}`,
    );
  }
  return lines;
}

export function formatHistoryDayExport(
  dateKey: string,
  records: StoredHistoryRecord[],
): string {
  const header = `수학 홈코치 코칭 기록 (${dateKey})`;
  if (records.length === 0) {
    return `${header}\n\n해당 날짜의 기록이 없습니다.`;
  }

  const blocks: string[] = [header, ""];

  records.forEach((record, index) => {
    if (index > 0) blocks.push("");
    blocks.push(
      `■ ${historyTimeLabel(record.timestamp)} · ${modeLabel(record.mode)} · ${record.summaryTitle}`,
    );
    const problems = record.problems
      .map(parseProblem)
      .filter((item): item is HistoryExportProblem => item !== null);
    if (problems.length === 0) {
      blocks.push("  (문항 정보 없음)");
      return;
    }
    problems.forEach((problem, problemIndex) => {
      if (problemIndex > 0) blocks.push("");
      blocks.push(...formatProblemBlock(problem).map((line) => `  ${line}`));
    });
  });

  return blocks.join("\n");
}

export type HistoryShareMethod = "share" | "clipboard" | "download";

export type ShareHistoryTextResult =
  | { ok: true; method: HistoryShareMethod }
  | { ok: false; aborted?: boolean };

export async function shareHistoryText(options: {
  title: string;
  text: string;
  fileName: string;
}): Promise<ShareHistoryTextResult> {
  const { title, text, fileName } = options;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return { ok: true, method: "share" };
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: false, aborted: true };
      }
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, aborted: true };
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    } catch {
      // fall through to download
    }
  }

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true, method: "download" };
}
