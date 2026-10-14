import { HISTORY_KEY } from "@/lib/wrongNote";
import { storageFailureMessage, type SaveResult } from "@/lib/storageFailure";

export interface StoredHistoryRecord {
  id: string;
  timestamp: number;
  mode: "grade" | "guide";
  problems: unknown[];
  summaryTitle: string;
}

export const HISTORY_LIMIT = 30;

const listeners = new Set<() => void>();
let snapshot: StoredHistoryRecord[] = [];
let snapshotKey: string | null | undefined;
const EMPTY: StoredHistoryRecord[] = [];

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeHistory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parseHistory(raw: string | null): StoredHistoryRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function getHistorySnapshot(): StoredHistoryRecord[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(HISTORY_KEY);
  } catch (error) {
    console.error("분석 기록을 읽지 못했습니다.", error instanceof Error ? error.message : "");
    return snapshot;
  }
  if (snapshotKey !== undefined && raw === snapshotKey) return snapshot;
  snapshot = parseHistory(raw);
  snapshotKey = raw;
  return snapshot;
}

export function getHistoryServerSnapshot(): StoredHistoryRecord[] {
  return EMPTY;
}

function writeHistory(records: StoredHistoryRecord[]): SaveResult {
  const raw = JSON.stringify(records);
  try {
    localStorage.setItem(HISTORY_KEY, raw);
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "history") };
  }
  snapshot = records;
  snapshotKey = raw;
  notify();
  return { ok: true };
}

export function prependHistoryRecord(record: StoredHistoryRecord): SaveResult {
  return writeHistory([record, ...getHistorySnapshot()].slice(0, HISTORY_LIMIT));
}

export function deleteHistoryRecord(id: string): SaveResult {
  return writeHistory(getHistorySnapshot().filter((item) => item.id !== id));
}

export function clearHistoryRecords(): SaveResult {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "history") };
  }
  snapshot = [];
  snapshotKey = null;
  notify();
  return { ok: true };
}
