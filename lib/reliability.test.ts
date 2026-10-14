import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleGenerativeAIAbortError } from "@google/generative-ai";
import { ANALYSIS_TIMEOUT_MESSAGE, fetchWithTimeout } from "@/lib/analysisTimeout";
import { isModelTimeout } from "@/lib/modelTimeout";
import {
  diagnosisCacheKey,
  diagnosisCachePayload,
  planDiagnosisRequest,
  readDiagnosisCache,
  writeDiagnosisCache,
} from "@/lib/diagnosisCache";
import { DIAGNOSIS_PROMPT_VERSION } from "@/lib/diagnosisReport";
import { clearHistoryRecords, deleteHistoryRecord, getHistorySnapshot, HISTORY_LIMIT, prependHistoryRecord } from "@/lib/historyStore";
import { MODEL_ID } from "@/lib/modelChoice";
import { HISTORY_ALL_DELETE_CONFIRM, HISTORY_ITEM_DELETE_CONFIRM, WRONG_NOTE_DELETE_CONFIRM } from "@/lib/recordDeletion";
import { sanitizeForLog } from "@/lib/safeLog";
import { StorageSaveError } from "@/lib/storageFailure";
import { HISTORY_KEY, WRONG_NOTE_KEY, appendWrongNotes, clearWrongNotes, loadWrongNotes, type WrongNote } from "@/lib/wrongNote";

const note = (overrides: Partial<WrongNote> = {}): WrongNote => ({
  problem_number: "1",
  problem_text: "2x + 3 = 11",
  concept: "일차방정식",
  error_analysis: "부호",
  student_answer: "7",
  correct_answer: "4",
  timestamp: 10,
  ...overrides,
});

describe("저장 실패", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("용량이 부족하면 오답 노트를 바꾸지 않고 알림용 오류를 던진다", () => {
    localStorage.setItem(WRONG_NOTE_KEY, JSON.stringify([note({ problem_text: "기존" })]));
    loadWrongNotes();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() =>
      appendWrongNotes([{ student_answer: "1", is_correct: false, problem_text: "새 오답", correct_answer: "2" }], 20),
    ).toThrow(StorageSaveError);
    expect(loadWrongNotes().map((item) => item.problem_text)).toEqual(["기존"]);
  });

  it("오답 저장소가 없고 초기 저장이 실패해도 채점 기록의 오답을 보여 준다", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        {
          mode: "grade",
          timestamp: 5,
          problems: [{ student_answer: "1", is_correct: false, problem_text: "시드 오답" }],
        },
      ]),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(loadWrongNotes().map((item) => item.problem_text)).toEqual(["시드 오답"]);
  });

  it("삭제가 실패하면 오답 노트를 비우지 않는다", () => {
    localStorage.setItem(WRONG_NOTE_KEY, JSON.stringify([note()]));
    loadWrongNotes();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("fail", "SecurityError");
    });
    expect(() => clearWrongNotes()).toThrow(/오답 노트를 저장하지 못했습니다/);
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem(WRONG_NOTE_KEY) || "[]")).toHaveLength(1);
  });
});

describe("기록 삭제와 오답 노트", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("분석 기록 하나는 지우고 오답 노트와 다른 기록은 남긴다", () => {
    localStorage.setItem(WRONG_NOTE_KEY, JSON.stringify([note({ problem_text: "유지되는 오답" })]));
    prependHistoryRecord({
      id: "keep",
      timestamp: 1,
      mode: "grade",
      problems: [],
      summaryTitle: "남김",
    });
    prependHistoryRecord({
      id: "drop",
      timestamp: 2,
      mode: "guide",
      problems: [],
      summaryTitle: "삭제",
    });

    expect(deleteHistoryRecord("drop").ok).toBe(true);
    expect(getHistorySnapshot().map((item) => item.id)).toEqual(["keep"]);
    expect(localStorage.getItem(WRONG_NOTE_KEY)).toContain("유지되는 오답");
    expect(HISTORY_ITEM_DELETE_CONFIRM).toContain("오답 노트는 삭제되지 않");
    expect(HISTORY_ALL_DELETE_CONFIRM).toContain("오답 노트는 삭제되지 않");
    expect(WRONG_NOTE_DELETE_CONFIRM).toContain("최근 코칭 기록은 삭제되지 않");
  });

  it("분석 기록을 모두 지워도 오답 노트는 남는다", () => {
    localStorage.setItem(WRONG_NOTE_KEY, JSON.stringify([note()]));
    prependHistoryRecord({ id: "a", timestamp: 1, mode: "grade", problems: [], summaryTitle: "a" });
    expect(clearHistoryRecords().ok).toBe(true);
    expect(getHistorySnapshot()).toEqual([]);
    expect(localStorage.getItem(WRONG_NOTE_KEY)).toContain("일차방정식");
  });

  it("최근 기록은 30개까지만 저장한다", () => {
    for (let index = 0; index < HISTORY_LIMIT + 2; index += 1) {
      prependHistoryRecord({
        id: `rec-${index}`,
        timestamp: index,
        mode: "grade",
        problems: [],
        summaryTitle: String(index),
      });
    }
    const ids = getHistorySnapshot().map((item) => item.id);
    expect(ids).toHaveLength(HISTORY_LIMIT);
    expect(ids[0]).toBe(`rec-${HISTORY_LIMIT + 1}`);
  });
});

describe("진단 캐시", () => {
  const report = {
    overall_status: "이항 부호가 흔들립니다.",
    top_weak_concepts: [{ concept: "일차방정식", reason: "부호" }],
    prescription: "틀린 방정식만 다시 풀어 보세요.",
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("같은 오답 집합과 모델, 프롬프트 버전은 같은 키를 쓴다", async () => {
    const identity = {
      modelId: MODEL_ID.flash,
      promptVersion: DIAGNOSIS_PROMPT_VERSION,
      notes: [note(), note({ problem_number: "2", timestamp: 11 })],
    };
    const key = await diagnosisCacheKey(identity);
    expect(await diagnosisCacheKey(identity)).toBe(key);
    expect(await diagnosisCacheKey({ ...identity, modelId: MODEL_ID.pro })).not.toBe(key);
    expect(await diagnosisCacheKey({ ...identity, promptVersion: "v2" })).not.toBe(key);
    expect(
      await diagnosisCacheKey({
        ...identity,
        notes: [identity.notes[1], identity.notes[0]],
      }),
    ).not.toBe(key);
    expect(diagnosisCachePayload(identity)).not.toContain("AIza");
  });

  it("저장된 진단은 재사용하고, 다시 진단은 새로 요청한다", () => {
    expect(planDiagnosisRequest(false, null)).toBe("request");
    expect(planDiagnosisRequest(false, report)).toBe("cache");
    expect(planDiagnosisRequest(true, report)).toBe("request");
  });

  it("캐시에 넣은 진단만 같은 키로 다시 읽는다", async () => {
    const key = await diagnosisCacheKey({
      modelId: MODEL_ID.flash,
      promptVersion: DIAGNOSIS_PROMPT_VERSION,
      notes: [note()],
    });
    expect(writeDiagnosisCache(key, report).ok).toBe(true);
    expect(readDiagnosisCache(key)).toEqual(report);
    expect(readDiagnosisCache(`${key}x`)).toBeNull();
  });
});

describe("분석 시간 제한과 로그", () => {
  it("요청이 제한 시간을 넘기면 다시 시도 안내를 던진다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithTimeout("/api/analyze", { method: "POST" }, 1000);
    const assertion = expect(pending).rejects.toThrow(ANALYSIS_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("모델 중단은 시간 초과로 구분한다", () => {
    expect(isModelTimeout(new GoogleGenerativeAIAbortError("Request aborted"))).toBe(true);
    expect(isModelTimeout(new Error("형식 오류"))).toBe(false);
  });

  it("로그에서 API 키, 접근 암호, 긴 이미지 데이터를 지운다", () => {
    const apiKey = "AIzaSyEXAMPLEKEY1234567890";
    const passcode = "family-pass-42";
    const blob = "A".repeat(120);
    const raw = `Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey} pass=${passcode} image=${blob}`;
    const cleaned = sanitizeForLog(new Error(raw), [apiKey, passcode]);

    expect(cleaned).not.toContain(apiKey);
    expect(cleaned).not.toContain(passcode);
    expect(cleaned).not.toContain(blob);
    expect(cleaned).toContain("key=[redacted]");
    expect(cleaned).toContain("[redacted-blob]");
  });
});
