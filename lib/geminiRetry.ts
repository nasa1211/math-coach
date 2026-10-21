/**
 * Gemini API 호출 재시도 로직
 * 일시적 오류(429, 5xx, 네트워크 오류)에 대해 exponential backoff로 재시도
 */

import { GEMINI_RETRY } from "./constants";

export class GeminiRetryError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly attempts?: number
  ) {
    super(message);
    this.name = "GeminiRetryError";
  }
}

/**
 * 재시도 가능한 오류인지 판단
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // HTTP 상태 코드가 있는 경우
  if (statusCode !== undefined) {
    return (GEMINI_RETRY.retryableStatusCodes as readonly number[]).includes(statusCode);
  }

  // 네트워크 오류
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("econnreset") ||
      message.includes("enotfound") ||
      message.includes("fetch failed")
    );
  }

  return false;
}

/**
 * exponential backoff 대기
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gemini API 호출을 재시도 로직과 함께 실행
 * @param fn API 호출 함수
 * @param options 재시도 옵션
 * @returns API 호출 결과
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? GEMINI_RETRY.maxRetries;
  const initialDelay = options.initialDelayMs ?? GEMINI_RETRY.initialDelayMs;
  const operationName = options.operationName ?? "Gemini API call";

  let lastError: unknown;
  let lastStatusCode: number | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // HTTP 응답 오류에서 상태 코드 추출 시도
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "status" in error.response
      ) {
        lastStatusCode = error.response.status as number;
      }

      // 마지막 시도였거나 재시도 불가능한 오류면 즉시 실패
      if (
        attempt > maxRetries ||
        !isRetryableError(error, lastStatusCode)
      ) {
        break;
      }

      // exponential backoff: 1초, 2초, 4초, ...
      const delayMs = initialDelay * Math.pow(2, attempt - 1);
      console.info(
        JSON.stringify({
          event: "gemini_retry",
          operation: operationName,
          attempt,
          maxRetries,
          delayMs,
          statusCode: lastStatusCode,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 100) : "unknown",
        })
      );

      await sleep(delayMs);
    }
  }

  // 모든 재시도 실패
  const errorMessage = lastError instanceof Error 
    ? lastError.message 
    : "알 수 없는 오류";
  
  throw new GeminiRetryError(
    `${operationName} 실패 (${maxRetries + 1}회 시도): ${errorMessage}`,
    lastStatusCode,
    maxRetries + 1
  );
}

/**
 * HTTP 상태 코드로 재시도 가능 여부 확인 (외부 노출용)
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  return (GEMINI_RETRY.retryableStatusCodes as readonly number[]).includes(statusCode);
}
