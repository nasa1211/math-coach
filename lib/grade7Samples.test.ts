import { describe, expect, it } from "vitest";
import { gradeKind, gradeSummary } from "@/utils/gradeStatus";
import { notesFromGradeProblems, type GradeProblem } from "@/lib/wrongNote";

interface WorkedProblem {
  problem_number: string;
  concept: string;
  problem_text: string;
  steps: string[];
  correct_answer: string;
  correct_student_answer: string;
  wrong_student_answer: string;
  wrong_reason: string;
}

function recorded(problem: WorkedProblem, studentAnswer: string, isCorrect: boolean): GradeProblem {
  return {
    problem_number: problem.problem_number,
    problem_text: problem.problem_text,
    concept: problem.concept,
    solution_steps: problem.steps,
    correct_answer: problem.correct_answer,
    student_answer: studentAnswer,
    is_correct: isCorrect,
    error_analysis: isCorrect ? "" : problem.wrong_reason,
  } as GradeProblem;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function primeFactors(value: number): number[] {
  const factors: number[] = [];
  let rest = value;
  for (let prime = 2; prime * prime <= rest; prime += 1) {
    while (rest % prime === 0) {
      factors.push(prime);
      rest /= prime;
    }
  }
  if (rest > 1) factors.push(rest);
  return factors;
}

function formatFactors(factors: number[]): string {
  const counts = new Map<number, number>();
  for (const factor of factors) counts.set(factor, (counts.get(factor) ?? 0) + 1);
  return [...counts.entries()]
    .map(([prime, count]) => (count === 1 ? String(prime) : `${prime}^${count}`))
    .join(" × ");
}

function grade7Problems(): WorkedProblem[] {
  const moved = 11 - 3;
  const equationAnswer = moved / 2;
  const distributedConstant = 2 * -3;
  const afterTranspose = 10 - distributedConstant;
  const distributedAnswer = afterTranspose / 2;
  const integerQuotient = -12 / 3;
  const integerAnswer = integerQuotient + 5;
  const denominator = 12;
  const fractionNumerator = 3 * (denominator / 4) - 1 * (denominator / 6);
  const fractionDivisor = gcd(fractionNumerator, denominator);
  const givenValue = -2;
  const substituted = -3 * givenValue + 1;
  const proportion = -2 * 4;
  const factors = primeFactors(84);

  return [
    {
      problem_number: "1",
      concept: "일차방정식",
      problem_text: "방정식 2x + 3 = 11을 푸시오.",
      steps: ["2x + 3 = 11", `2x = ${moved}`, `x = ${equationAnswer}`],
      correct_answer: String(equationAnswer),
      correct_student_answer: "4",
      wrong_student_answer: "7",
      wrong_reason: "상수항을 이항할 때 부호를 바꾸지 않고 11+3으로 계산했습니다.",
    },
    {
      problem_number: "2",
      concept: "일차방정식",
      problem_text: "방정식 2(x - 3) = 10을 푸시오.",
      steps: ["2(x - 3) = 10", `2x - 6 = 10`, `2x = ${afterTranspose}`, `x = ${distributedAnswer}`],
      correct_answer: String(distributedAnswer),
      correct_student_answer: "8",
      wrong_student_answer: "2",
      wrong_reason: "괄호에 2를 곱하지 않고 x - 3 = 10으로 풀었습니다.",
    },
    {
      problem_number: "3",
      concept: "정수와 유리수",
      problem_text: "(-12) ÷ 3 + 5를 계산하시오.",
      steps: [`(-12) ÷ 3 = ${integerQuotient}`, `${integerQuotient} + 5 = ${integerAnswer}`],
      correct_answer: String(integerAnswer),
      correct_student_answer: "1",
      wrong_student_answer: "-9",
      wrong_reason: "나눗셈보다 덧셈을 먼저 하여 -12 ÷ 8로 계산했습니다.",
    },
    {
      problem_number: "4",
      concept: "정수와 유리수",
      problem_text: "3/4 - 1/6을 계산하시오.",
      steps: [
        "통분하면 분모는 12",
        `9/12 - 2/12 = ${fractionNumerator}/${denominator}`,
        `기약분수 ${fractionNumerator / fractionDivisor}/${denominator / fractionDivisor}`,
      ],
      correct_answer: `${fractionNumerator / fractionDivisor}/${denominator / fractionDivisor}`,
      correct_student_answer: "7/12",
      wrong_student_answer: "2/2",
      wrong_reason: "분모끼리, 분자끼리 따로 뺐습니다.",
    },
    {
      problem_number: "5",
      concept: "문자와 식",
      problem_text: "a = -2일 때 -3a + 1의 값을 구하시오.",
      steps: [`a = ${givenValue}`, `-3 × (${givenValue}) + 1`, `${substituted}`],
      correct_answer: String(substituted),
      correct_student_answer: "7",
      wrong_student_answer: "-2",
      wrong_reason: "주어진 a의 값 -2를 식의 값으로 그대로 적었습니다.",
    },
    {
      problem_number: "6",
      concept: "좌표평면과 그래프",
      problem_text: "정비례 관계 y = -2x에서 x = 4일 때 y의 값을 구하시오.",
      steps: ["y = -2x", "y = -2 × 4", `y = ${proportion}`],
      correct_answer: String(proportion),
      correct_student_answer: "-8",
      wrong_student_answer: "8",
      wrong_reason: "x에 4를 대입할 때 음의 부호를 빠뜨렸습니다.",
    },
    {
      problem_number: "7",
      concept: "소인수분해",
      problem_text: "84를 소인수분해하시오.",
      steps: ["84 = 2 × 42", "42 = 2 × 21", "21 = 3 × 7", formatFactors(factors)],
      correct_answer: formatFactors(factors),
      correct_student_answer: "2^2 × 3 × 7",
      wrong_student_answer: "2 × 3 × 7",
      wrong_reason: "2를 한 번만 세고 4가 남아 있는 것을 놓쳤습니다.",
    },
  ];
}

describe("중학교 1학년 대표 문항의 풀이와 채점", () => {
  const problems = grade7Problems();

  it("중간 풀이의 마지막 결과가 정답과 같다", () => {
    expect(problems.map((problem) => [problem.problem_number, problem.correct_answer])).toEqual([
      ["1", "4"],
      ["2", "8"],
      ["3", "1"],
      ["4", "7/12"],
      ["5", "7"],
      ["6", "-8"],
      ["7", "2^2 × 3 × 7"],
    ]);

    for (const problem of problems) {
      expect(problem.steps.at(-1)).toContain(problem.correct_answer);
      expect(problem.correct_student_answer).toBe(problem.correct_answer);
      expect(problem.wrong_student_answer).not.toBe(problem.correct_answer);
    }
  });

  it("맞은 답은 정답, 다른 답은 오답으로 판정하고 오답만 노트에 남긴다", () => {
    const graded: GradeProblem[] = problems.flatMap((problem) => [
      recorded(problem, problem.correct_student_answer, true),
      recorded(problem, problem.wrong_student_answer, false),
    ]);

    expect(graded.filter((problem) => gradeKind(problem) === "correct")).toHaveLength(problems.length);
    expect(graded.filter((problem) => gradeKind(problem) === "wrong")).toHaveLength(problems.length);
    expect(gradeSummary(graded)).toMatchObject({
      correct: problems.length,
      wrong: problems.length,
      graded: problems.length * 2,
      skipped: 0,
    });

    const notes = notesFromGradeProblems(graded, 100);
    expect(notes.map((item) => item.student_answer)).toEqual(problems.map((problem) => problem.wrong_student_answer));
    expect(notes.map((item) => item.correct_answer)).toEqual(problems.map((problem) => problem.correct_answer));
    expect(notes.every((item) => item.student_answer !== item.correct_answer)).toBe(true);
  });

  it("같은 시험지의 미작성과 해설지는 오답 노트에 들어가지 않는다", () => {
    const equation = problems[0];
    const sheet: GradeProblem[] = [
      recorded(equation, equation.wrong_student_answer, false),
      {
        problem_number: "8",
        problem_text: "답을 쓰지 않은 문제",
        student_answer: "미작성",
        is_correct: false,
        error_analysis: "문제지에 답안 표기가 없습니다.",
      },
      {
        problem_number: "9",
        problem_text: "정답지만 촬영된 문제",
        student_answer: "미작성",
        is_correct: false,
        error_analysis: "해설지 이미지가 감지되었습니다.",
      },
    ];

    expect(sheet.map((problem) => gradeKind(problem))).toEqual(["wrong", "blank", "answerKey"]);
    expect(notesFromGradeProblems(sheet, 100)).toHaveLength(1);
    expect(gradeSummary(sheet)).toMatchObject({ correct: 0, wrong: 1, blank: 1, answerKey: 1, skipped: 2 });
  });
});
