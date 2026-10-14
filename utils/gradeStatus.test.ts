import { describe, expect, it } from "vitest";
import { gradeBadge, gradeKind, gradeSummary, historyScoreLabel } from "@/utils/gradeStatus";

describe("gradeKind", () => {
  it("해설지이면서 답이 없으면 해설지로 구분한다", () => {
    expect(
      gradeKind({
        student_answer: "미작성",
        is_correct: false,
        error_analysis: "해설지 이미지가 감지되었습니다.",
      }),
    ).toBe("answerKey");
    expect(
      gradeKind({
        student_answer: "   ",
        is_correct: false,
        error_analysis: "해설지가 포함되어 있습니다.",
      }),
    ).toBe("answerKey");
  });

  it("해설지라는 말이 있어도 학생 답이 있으면 채점 결과를 따른다", () => {
    expect(
      gradeKind({
        student_answer: "3",
        is_correct: false,
        error_analysis: "해설지와 다른 답을 썼습니다.",
      }),
    ).toBe("wrong");
  });

  it("미작성과 빈 오답은 오답이 아니라 미작성이다", () => {
    expect(gradeKind({ student_answer: "미작성", is_correct: false })).toBe("blank");
    expect(gradeKind({ student_answer: "미 작성", is_correct: true })).toBe("blank");
    expect(gradeKind({ student_answer: "", is_correct: false })).toBe("blank");
    expect(gradeKind({ student_answer: "   ", is_correct: false })).toBe("blank");
  });

  it("판독불가는 정답 표시보다 먼저 구분한다", () => {
    expect(gradeKind({ student_answer: "판독불가", is_correct: true })).toBe("unreadable");
    expect(gradeKind({ student_answer: "판독 불가", is_correct: false })).toBe("unreadable");
  });

  it("실제 답안은 is_correct로 정답과 오답을 가른다", () => {
    expect(gradeKind({ student_answer: "4", is_correct: true })).toBe("correct");
    expect(gradeKind({ student_answer: " 4 ", is_correct: true })).toBe("correct");
    expect(gradeKind({ student_answer: "5", is_correct: false })).toBe("wrong");
  });

  it("빈 답이 정답으로 표시되면 정답이고, 판정이 없으면 판정 없음이다", () => {
    expect(gradeKind({ student_answer: "", is_correct: true })).toBe("correct");
    expect(gradeKind({ student_answer: "3" })).toBe("ungraded");
    expect(gradeKind({})).toBe("ungraded");
  });
});

describe("gradeSummary와 historyScoreLabel", () => {
  const problems = [
    { student_answer: "4", is_correct: true },
    { student_answer: "5", is_correct: false },
    { student_answer: "미작성", is_correct: false },
    { student_answer: "판독불가", is_correct: false },
    { student_answer: "미작성", is_correct: false, error_analysis: "해설지" },
    { student_answer: "3" },
  ];

  it("채점된 문항과 미채점 문항을 나눠 센다", () => {
    expect(gradeSummary(problems)).toEqual({
      correct: 1,
      wrong: 1,
      blank: 1,
      unreadable: 1,
      answerKey: 1,
      ungraded: 1,
      graded: 2,
      skipped: 4,
    });
    expect(historyScoreLabel(problems)).toBe("정답 1/2 · 미채점 4");
  });

  it("전부 채점되면 미채점 수를 붙이지 않는다", () => {
    expect(
      historyScoreLabel([
        { student_answer: "1", is_correct: true },
        { student_answer: "2", is_correct: false },
      ]),
    ).toBe("정답 1/2");
  });

  it("채점된 문항이 없으면 미채점만 보여 준다", () => {
    expect(historyScoreLabel([{ student_answer: "미작성", is_correct: false }])).toBe("미채점 1");
  });
});

describe("gradeBadge", () => {
  it("화면 문구를 유지한다", () => {
    expect(gradeBadge("correct").label).toBe("정답");
    expect(gradeBadge("wrong").label).toBe("오답 코칭 필요");
    expect(gradeBadge("blank").label).toBe("미작성");
    expect(gradeBadge("unreadable").label).toBe("판독불가");
    expect(gradeBadge("answerKey").label).toBe("해설지");
    expect(gradeBadge("ungraded").label).toBe("판정 없음");
  });
});
