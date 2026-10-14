import { describe, expect, it } from "vitest";
import { buildDiagnosisPrompt, parseDiagnosisReport } from "@/lib/diagnosisReport";
import type { WrongNote } from "@/lib/wrongNote";

const note = (overrides: Partial<WrongNote> = {}): WrongNote => ({
  problem_number: "3",
  problem_text: "2x + 3 = 11",
  concept: "일차방정식",
  error_analysis: "상수항을 이항할 때 부호를 바꾸지 않았습니다.",
  student_answer: "5",
  correct_answer: "4",
  timestamp: 1,
  ...overrides,
});

describe("parseDiagnosisReport", () => {
  it("총평, 개념, 처방이 있으면 진단으로 받는다", () => {
    expect(
      parseDiagnosisReport({
        overall_status: " 일차방정식에서 이항 부호가 흔들립니다. ",
        top_weak_concepts: [
          { concept: "일차방정식", reason: "부호 처리" },
          "정수와 유리수",
          { concept: " ", reason: "빈 개념" },
          { concept: "좌표평면", reason: "" },
          { concept: "네 번째", reason: "버려짐" },
        ],
        prescription: "오늘 틀린 방정식 두 문제만 다시 풀어 보세요.",
      }),
    ).toEqual({
      overall_status: "일차방정식에서 이항 부호가 흔들립니다.",
      top_weak_concepts: [
        { concept: "일차방정식", reason: "부호 처리" },
        { concept: "정수와 유리수", reason: "" },
        { concept: "좌표평면", reason: "" },
      ],
      prescription: "오늘 틀린 방정식 두 문제만 다시 풀어 보세요.",
    });
  });

  it("필수 항목이나 개념이 없으면 null이다", () => {
    expect(parseDiagnosisReport(null)).toBeNull();
    expect(parseDiagnosisReport([])).toBeNull();
    expect(parseDiagnosisReport({ overall_status: "총평", prescription: "처방" })).toBeNull();
    expect(
      parseDiagnosisReport({
        overall_status: "   ",
        prescription: "처방",
        top_weak_concepts: ["분수"],
      }),
    ).toBeNull();
    expect(
      parseDiagnosisReport({
        overall_status: "총평",
        prescription: "",
        top_weak_concepts: ["분수"],
      }),
    ).toBeNull();
    expect(
      parseDiagnosisReport({
        overall_status: "총평",
        prescription: "처방",
        top_weak_concepts: [{ reason: "이유만" }, 3, null],
      }),
    ).toBeNull();
  });
});

describe("buildDiagnosisPrompt", () => {
  it("틀린 문항의 개념과 답만 근거로 넣고 앞의 40개만 사용한다", () => {
    const notes = Array.from({ length: 41 }, (_, index) =>
      note({ problem_number: String(index + 1), concept: `개념${index + 1}` }),
    );
    const prompt = buildDiagnosisPrompt(notes);
    expect(prompt).toContain("개념1");
    expect(prompt).toContain("개념40");
    expect(prompt).not.toContain("개념41");
    expect(prompt).toContain("2x + 3 = 11");
    expect(prompt).toContain("미작성이나 판독불가는 포함되어 있지 않습니다");
  });
});
