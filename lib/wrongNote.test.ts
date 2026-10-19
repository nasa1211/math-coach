import { beforeEach, describe, expect, it } from "vitest";
import {
  HISTORY_KEY,
  WRONG_NOTE_KEY,
  WRONG_NOTE_LIMIT,
  appendWrongNotes,
  classifyErrorPattern,
  clearWrongNotes,
  conceptCounts,
  filterNotesByPeriod,
  loadWrongNotes,
  mergeWrongNotes,
  notesFromGradeProblems,
  patternCounts,
  periodCutoff,
  type WrongNote,
} from "@/lib/wrongNote";

const note = (overrides: Partial<WrongNote> = {}): WrongNote => ({
  problem_number: "1",
  problem_text: "문제",
  concept: "일차방정식",
  error_analysis: "계산 실수",
  student_answer: "3",
  correct_answer: "4",
  timestamp: 1,
  ...overrides,
});

describe("filterNotesByPeriod", () => {
  const now = new Date(2026, 9, 14, 15, 30, 0).getTime();

  it("전체는 같은 배열을 그대로 돌려준다", () => {
    const notes = [note()];
    expect(filterNotesByPeriod(notes, "all", now)).toBe(notes);
    expect(periodCutoff("all", now)).toBeNull();
  });

  it("최근 7일은 오늘을 포함해 7일이고 자정을 경계로 한다", () => {
    const cutoff = periodCutoff("7d", now);
    expect(cutoff).not.toBeNull();
    const boundary = new Date(cutoff!);
    expect(boundary.getFullYear()).toBe(2026);
    expect(boundary.getMonth()).toBe(9);
    expect(boundary.getDate()).toBe(8);
    expect(boundary.getHours()).toBe(0);
    expect(boundary.getMinutes()).toBe(0);

    const notes = [
      note({ problem_number: "경계", timestamp: cutoff! }),
      note({ problem_number: "이전", timestamp: cutoff! - 1 }),
      note({ problem_number: "오늘", timestamp: now }),
    ];
    expect(filterNotesByPeriod(notes, "7d", now).map((item) => item.problem_number)).toEqual([
      "경계",
      "오늘",
    ]);
  });

  it("최근 30일은 9월 15일 0시부터다", () => {
    const cutoff = periodCutoff("30d", now);
    const boundary = new Date(cutoff!);
    expect(boundary.getFullYear()).toBe(2026);
    expect(boundary.getMonth()).toBe(8);
    expect(boundary.getDate()).toBe(15);
    expect(filterNotesByPeriod([note({ timestamp: cutoff! - 1 })], "30d", now)).toEqual([]);
    expect(filterNotesByPeriod([note({ timestamp: cutoff! })], "30d", now)).toHaveLength(1);
  });
});

describe("오답 분류와 누적", () => {
  it("오답만 노트에 넣고 개념이 없으면 미분류로 둔다", () => {
    const timestamp = 50;
    const notes = notesFromGradeProblems(
      [
        { student_answer: "4", is_correct: true, problem_text: "맞은 문제", correct_answer: "4" },
        {
          student_answer: "5",
          is_correct: false,
          problem_number: " 2 ",
          problem_text: " 틀린 문제 ",
          concept: " ",
          error_analysis: " 부호 ",
          correct_answer: " 4 ",
        },
        { student_answer: "미작성", is_correct: false, problem_text: "빈칸" },
        { student_answer: "판독불가", is_correct: false, problem_text: "흐림" },
        {
          student_answer: "미작성",
          is_correct: false,
          error_analysis: "해설지",
          problem_text: "정답지",
        },
      ],
      timestamp,
    );
    expect(notes).toEqual([
      {
        problem_number: "2",
        problem_text: "틀린 문제",
        concept: "개념 미분류",
        error_analysis: "부호",
        student_answer: "5",
        correct_answer: "4",
        timestamp,
      },
    ]);
  });

  it("새 오답을 앞에 두고 80개까지만 보관한다", () => {
    const existing = Array.from({ length: WRONG_NOTE_LIMIT }, (_, index) =>
      note({ problem_number: `old-${index}` }),
    );
    const merged = mergeWrongNotes(existing, [note({ problem_number: "new" })]);
    expect(merged).toHaveLength(WRONG_NOTE_LIMIT);
    expect(merged[0]?.problem_number).toBe("new");
    expect(merged.at(-1)?.problem_number).toBe("old-78");
  });

  it("실수 유형은 독해, 계산, 개념 순서로 고른다", () => {
    expect(classifyErrorPattern("조건을 잘못 읽고 계산도 틀렸습니다")).toBe("reading");
    expect(classifyErrorPattern("받아올림 계산 실수")).toBe("calculation");
    expect(classifyErrorPattern("공식과 개념을 혼동")).toBe("concept");
    expect(classifyErrorPattern("그냥 틀렸습니다")).toBe("other");
    expect(patternCounts([note({ error_analysis: "계산" }), note({ error_analysis: "기타" })]).map(
      (item) => item.pattern,
    )).toEqual(["calculation", "other"]);
  });

  it("같은 개념의 횟수를 많은 순으로 센다", () => {
    expect(
      conceptCounts([
        note({ concept: "좌표" }),
        note({ concept: "방정식" }),
        note({ concept: "방정식" }),
      ]),
    ).toEqual([
      { concept: "방정식", count: 2 },
      { concept: "좌표", count: 1 },
    ]);
  });
});

describe("기록 저장소와 오답 저장소", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("오답 노트를 지워도 분석 기록은 남고, 분석 기록을 지워도 이미 저장된 오답은 남는다", () => {
    const history = JSON.stringify([
      {
        id: "rec-1",
        mode: "grade",
        timestamp: 10,
        problems: [{ student_answer: "9", is_correct: false, problem_text: "3+5", correct_answer: "8" }],
      },
    ]);
    localStorage.setItem(HISTORY_KEY, history);
    appendWrongNotes(
      [{ student_answer: "1", is_correct: false, problem_text: "2+2", correct_answer: "4", concept: "덧셈" }],
      20,
    );

    clearWrongNotes();
    expect(localStorage.getItem(HISTORY_KEY)).toBe(history);
    expect(loadWrongNotes()).toEqual([]);

    localStorage.setItem(
      WRONG_NOTE_KEY,
      JSON.stringify([note({ problem_text: "저장된 오답", timestamp: 30 })]),
    );
    localStorage.removeItem(HISTORY_KEY);
    expect(loadWrongNotes().map((item) => item.problem_text)).toEqual(["저장된 오답"]);
  });

  it("오답 저장소가 아직 없으면 채점 기록의 오답만 가져온다", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        {
          mode: "grade",
          timestamp: 5,
          problems: [
            { student_answer: "1", is_correct: false, problem_text: "오답", concept: "분수" },
            { student_answer: "2", is_correct: true, problem_text: "정답" },
          ],
        },
        {
          mode: "guide",
          timestamp: 6,
          problems: [{ student_answer: "1", is_correct: false, problem_text: "지도 모드" }],
        },
      ]),
    );
    expect(loadWrongNotes().map((item) => item.problem_text)).toEqual(["오답"]);
    expect(localStorage.getItem(WRONG_NOTE_KEY)).toContain("오답");
  });
});
