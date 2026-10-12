import { gradeKind, type GradeFields } from "@/utils/gradeStatus";

export const WRONG_NOTE_KEY = "math_coach_wrong_notes_v1";
export const HISTORY_KEY = "math_coach_history_v1";
export const WRONG_NOTE_LIMIT = 80;

export interface WrongNote {
  problem_number: string;
  problem_text: string;
  concept: string;
  error_analysis: string;
  student_answer: string;
  correct_answer: string;
  timestamp: number;
}

export type ErrorPattern = "calculation" | "concept" | "reading" | "other";

export type NotePeriod = "all" | "7d" | "30d";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function periodCutoff(period: NotePeriod, now = Date.now()): number | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime() - (days - 1) * MS_PER_DAY;
}

export function filterNotesByPeriod(
  notes: WrongNote[],
  period: NotePeriod,
  now = Date.now(),
): WrongNote[] {
  const cutoff = periodCutoff(period, now);
  if (cutoff === null) return notes;
  return notes.filter((note) => note.timestamp >= cutoff);
}

export interface GradeProblem extends GradeFields {
  problem_number?: string;
  problem_text?: string;
  concept?: string;
  correct_answer?: string;
}

const PATTERN_LABEL: Record<ErrorPattern, string> = {
  calculation: "계산/부호 실수",
  concept: "개념 혼동",
  reading: "조건 독해 미숙",
  other: "기타",
};

export function errorPatternLabel(pattern: ErrorPattern): string {
  return PATTERN_LABEL[pattern];
}

export function classifyErrorPattern(errorAnalysis: string): ErrorPattern {
  const text = errorAnalysis.replace(/\s/g, "");
  if (/조건|독해|지문|잘못읽|요구하는|묻는말/.test(text)) return "reading";
  if (/계산|부호|연산|덧셈|뺄셈|곱셈|나눗셈|소수점|받아올림|받아내림/.test(text)) {
    return "calculation";
  }
  if (/개념|공식|정의|혼동|착각|성질|정리/.test(text)) return "concept";
  return "other";
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function notesFromGradeProblems(problems: GradeProblem[], timestamp: number): WrongNote[] {
  return problems
    .filter((problem) => gradeKind(problem) === "wrong")
    .map((problem) => ({
      problem_number: asText(problem.problem_number),
      problem_text: asText(problem.problem_text),
      concept: asText(problem.concept) || "개념 미분류",
      error_analysis: asText(problem.error_analysis),
      student_answer: asText(problem.student_answer),
      correct_answer: asText(problem.correct_answer),
      timestamp,
    }));
}

export function mergeWrongNotes(existing: WrongNote[], incoming: WrongNote[]): WrongNote[] {
  return [...incoming, ...existing].slice(0, WRONG_NOTE_LIMIT);
}

export function conceptCounts(notes: WrongNote[]): { concept: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const concept = note.concept || "개념 미분류";
    counts.set(concept, (counts.get(concept) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([concept, count]) => ({ concept, count }))
    .sort((a, b) => b.count - a.count || a.concept.localeCompare(b.concept, "ko"));
}

export function patternCounts(notes: WrongNote[]): { pattern: ErrorPattern; label: string; count: number }[] {
  const counts: Record<ErrorPattern, number> = {
    calculation: 0,
    concept: 0,
    reading: 0,
    other: 0,
  };
  for (const note of notes) {
    counts[classifyErrorPattern(note.error_analysis)] += 1;
  }
  return (Object.keys(counts) as ErrorPattern[])
    .map((pattern) => ({ pattern, label: PATTERN_LABEL[pattern], count: counts[pattern] }))
    .filter((item) => item.count > 0);
}

function parseNotes(raw: string | null): WrongNote[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWrongNote);
  } catch {
    return [];
  }
}

function isWrongNote(value: unknown): value is WrongNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<WrongNote>;
  return typeof note.timestamp === "number" && typeof note.problem_text === "string";
}

function notesFromHistory(raw: string | null): WrongNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const notes: WrongNote[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as { mode?: string; timestamp?: number; problems?: GradeProblem[] };
      if (record.mode !== "grade" || !Array.isArray(record.problems)) continue;
      notes.push(...notesFromGradeProblems(record.problems, record.timestamp ?? Date.now()));
    }
    return notes.sort((a, b) => b.timestamp - a.timestamp).slice(0, WRONG_NOTE_LIMIT);
  } catch {
    return [];
  }
}

const noteListeners = new Set<() => void>();
let noteSnapshot: WrongNote[] = [];
let noteSnapshotKey: string | null | undefined;

function readStorage(): WrongNote[] | null {
  if (typeof window === "undefined") return [];
  return parseNotes(localStorage.getItem(WRONG_NOTE_KEY));
}

function writeStorage(notes: WrongNote[], notify = true) {
  const raw = JSON.stringify(notes);
  localStorage.setItem(WRONG_NOTE_KEY, raw);
  noteSnapshot = notes;
  noteSnapshotKey = raw;
  if (!notify) return;
  for (const listener of noteListeners) listener();
}

export function subscribeWrongNotes(listener: () => void) {
  noteListeners.add(listener);
  return () => {
    noteListeners.delete(listener);
  };
}

export function getWrongNotesSnapshot(): WrongNote[] | null {
  const raw = localStorage.getItem(WRONG_NOTE_KEY);
  if (noteSnapshotKey !== undefined && raw === noteSnapshotKey) return noteSnapshot;
  noteSnapshot = loadWrongNotes();
  noteSnapshotKey = localStorage.getItem(WRONG_NOTE_KEY);
  return noteSnapshot;
}

export function getWrongNotesServerSnapshot(): WrongNote[] | null {
  return null;
}

export function loadWrongNotes(): WrongNote[] {
  const stored = readStorage();
  if (stored) return stored;
  const seeded = notesFromHistory(localStorage.getItem(HISTORY_KEY));
  writeStorage(seeded, false);
  return seeded;
}

export function appendWrongNotes(problems: GradeProblem[], timestamp: number): number {
  const incoming = notesFromGradeProblems(problems, timestamp);
  if (incoming.length === 0) return 0;
  const base = readStorage() ?? notesFromHistory(localStorage.getItem(HISTORY_KEY));
  writeStorage(mergeWrongNotes(base, incoming));
  return incoming.length;
}

export function clearWrongNotes() {
  writeStorage([]);
}
