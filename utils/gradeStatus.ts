export type GradeKind =
  | "correct"
  | "wrong"
  | "blank"
  | "unreadable"
  | "answerKey"
  | "ungraded";

export interface GradeFields {
  is_correct?: boolean;
  student_answer?: string;
  error_analysis?: string;
}

export interface GradeSummary {
  correct: number;
  wrong: number;
  blank: number;
  unreadable: number;
  answerKey: number;
  ungraded: number;
  graded: number;
  skipped: number;
}

function normalizedAnswer(value: string | undefined): string {
  return (value ?? "").replace(/\s/g, "");
}

export function gradeKind(problem: GradeFields): GradeKind {
  const answer = normalizedAnswer(problem.student_answer);
  const analysis = problem.error_analysis ?? "";
  const unmarked = answer === "" || answer === "미작성";

  if (analysis.includes("해설지") && unmarked) return "answerKey";
  if (answer === "미작성" || (answer === "" && problem.is_correct === false)) return "blank";
  if (answer === "판독불가") return "unreadable";
  if (problem.is_correct === true) return "correct";
  if (problem.is_correct === false) return "wrong";
  return "ungraded";
}

export function gradeSummary(problems: GradeFields[]): GradeSummary {
  const summary: GradeSummary = {
    correct: 0,
    wrong: 0,
    blank: 0,
    unreadable: 0,
    answerKey: 0,
    ungraded: 0,
    graded: 0,
    skipped: 0,
  };

  for (const problem of problems) {
    summary[gradeKind(problem)] += 1;
  }

  summary.graded = summary.correct + summary.wrong;
  summary.skipped =
    summary.blank + summary.unreadable + summary.answerKey + summary.ungraded;
  return summary;
}

export function historyScoreLabel(problems: GradeFields[]): string {
  const summary = gradeSummary(problems);
  if (summary.graded === 0) return `미채점 ${summary.skipped}`;
  if (summary.skipped === 0) return `정답 ${summary.correct}/${summary.graded}`;
  return `정답 ${summary.correct}/${summary.graded} · 미채점 ${summary.skipped}`;
}

export function gradeBadge(kind: GradeKind): { label: string; tone: "green" | "red" | "slate" } {
  switch (kind) {
    case "correct":
      return { label: "정답", tone: "green" };
    case "wrong":
      return { label: "오답 코칭 필요", tone: "red" };
    case "blank":
      return { label: "미작성", tone: "slate" };
    case "unreadable":
      return { label: "판독불가", tone: "slate" };
    case "answerKey":
      return { label: "해설지", tone: "slate" };
    case "ungraded":
      return { label: "판정 없음", tone: "slate" };
  }
}
