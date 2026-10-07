export const ANALYSIS_FORMAT_ERROR =
  "문제 영역을 읽지 못했습니다. 문제만 보이게 다시 촬영해 주세요.";

export const ANALYSIS_FAILED_ERROR =
  "분석을 마치지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function analysisProblems(parsed: unknown): Record<string, unknown>[] | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const problems = (parsed as { problems?: unknown }).problems;
  if (!Array.isArray(problems) || problems.length === 0) return null;
  if (problems.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    return null;
  }

  return problems as Record<string, unknown>[];
}
