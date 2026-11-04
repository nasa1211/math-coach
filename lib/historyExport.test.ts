import { describe, expect, it } from "vitest";
import {
  collectHistoryDates,
  defaultHistoryExportDate,
  filterHistoryByDate,
  formatHistoryDayExport,
  historyDateKey,
  historyTimeLabel,
} from "@/lib/historyExport";
import type { StoredHistoryRecord } from "@/lib/historyStore";

const record = (overrides: Partial<StoredHistoryRecord> = {}): StoredHistoryRecord => ({
  id: "1",
  timestamp: Date.parse("2026-10-14T06:30:00Z"),
  mode: "grade",
  summaryTitle: "1번 방정식",
  problems: [
    {
      problem_number: "1",
      problem_text: "2x=4",
      correct_answer: "2",
      solution_steps: ["양변을 2로 나눈다", "x=2"],
      student_answer: "3",
      is_correct: false,
    },
  ],
  ...overrides,
});

describe("historyDateKey", () => {
  it("Asia/Seoul 기준 YYYY-MM-DD를 반환한다", () => {
    expect(historyDateKey(Date.parse("2026-10-14T06:30:00Z"))).toBe("2026-10-14");
  });
});

describe("collectHistoryDates", () => {
  it("기록이 있는 날짜를 최신순으로 모은다", () => {
    const dates = collectHistoryDates([
      record({ timestamp: Date.parse("2026-10-12T15:00:00Z") }),
      record({ timestamp: Date.parse("2026-10-14T06:30:00Z") }),
      record({ id: "2", timestamp: Date.parse("2026-10-14T08:00:00Z") }),
    ]);
    expect(dates).toEqual(["2026-10-14", "2026-10-13"]);
  });
});

describe("defaultHistoryExportDate", () => {
  it("오늘 기록이 있으면 오늘을 고른다", () => {
    const now = Date.parse("2026-10-14T10:00:00Z");
    expect(defaultHistoryExportDate(["2026-10-13", "2026-10-14"], now)).toBe("2026-10-14");
  });

  it("오늘 기록이 없으면 가장 최근 날짜를 고른다", () => {
    const now = Date.parse("2026-10-15T10:00:00Z");
    expect(defaultHistoryExportDate(["2026-10-14", "2026-10-13"], now)).toBe("2026-10-14");
  });
});

describe("formatHistoryDayExport", () => {
  it("한국어 plain text로 기록과 문항을 포맷한다", () => {
    const text = formatHistoryDayExport("2026-10-14", [record()]);
    expect(text).toContain("수학 홈코치 코칭 기록 (2026-10-14)");
    expect(text).toContain(historyTimeLabel(record().timestamp));
    expect(text).toContain("채점 · 1번 방정식");
    expect(text).toContain("[1번]");
    expect(text).toContain("문제: 2x=4");
    expect(text).toContain("정답: 2");
    expect(text).toContain("1. 양변을 2로 나눈다");
    expect(text).toContain("학생 답: 3 (오답)");
  });

  it("풀이 가이드 모드를 표시한다", () => {
    const text = formatHistoryDayExport("2026-10-14", [
      record({ mode: "guide", summaryTitle: "미리 풀기" }),
    ]);
    expect(text).toContain("풀이 가이드 · 미리 풀기");
  });
});

describe("filterHistoryByDate", () => {
  it("선택 날짜 기록만 시간순으로 반환한다", () => {
    const early = record({ id: "a", timestamp: Date.parse("2026-10-14T06:30:00Z") });
    const late = record({ id: "b", timestamp: Date.parse("2026-10-14T08:00:00Z") });
    const other = record({ id: "c", timestamp: Date.parse("2026-10-12T15:00:00Z") });
    expect(filterHistoryByDate([late, other, early], "2026-10-14").map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
