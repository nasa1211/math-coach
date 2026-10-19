export const SERVER_ANALYSIS_TIMEOUT_MS = 55_000;
export const CLIENT_ANALYSIS_TIMEOUT_MS = 90_000;
export const ANALYSIS_TIMEOUT_MESSAGE =
  "분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = CLIENT_ANALYSIS_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(ANALYSIS_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
