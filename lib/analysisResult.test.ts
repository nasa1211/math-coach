import { describe, expect, it } from "vitest";
import { analysisProblems } from "@/lib/analysisResult";

describe("analysisProblems", () => {
  it("문제 객체 배열만 통과시킨다", () => {
    const problems = analysisProblems({
      mode: "grade",
      problems: [{ problem_number: "1", correct_answer: "4" }],
    });
    expect(problems).toEqual([{ problem_number: "1", correct_answer: "4" }]);
  });

  it("비어 있거나 문제 모양이 아니면 null이다", () => {
    expect(analysisProblems(null)).toBeNull();
    expect(analysisProblems(undefined)).toBeNull();
    expect(analysisProblems([])).toBeNull();
    expect(analysisProblems("{\"problems\":[]}")).toBeNull();
    expect(analysisProblems({ problems: [] })).toBeNull();
    expect(analysisProblems({})).toBeNull();
    expect(analysisProblems({ problems: [null] })).toBeNull();
    expect(analysisProblems({ problems: [1] })).toBeNull();
    expect(analysisProblems({ problems: ["1번"] })).toBeNull();
    expect(analysisProblems({ problems: [{ ok: true }, null] })).toBeNull();
    expect(analysisProblems({ problems: [[{ nested: true }]] })).toBeNull();
  });
});
