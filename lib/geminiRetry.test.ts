import { describe, it, expect, vi } from "vitest";
import { withGeminiRetry, GeminiRetryError, isRetryableStatusCode } from "./geminiRetry";

describe("withGeminiRetry", () => {
  it("성공하는 호출은 재시도 없이 결과를 반환해야 함", async () => {
    const mockFn = vi.fn().mockResolvedValue("success");

    const result = await withGeminiRetry(mockFn, { maxRetries: 3 });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("일시적 오류(429)는 재시도해야 함", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue("success");

    const result = await withGeminiRetry(mockFn, {
      maxRetries: 3,
      initialDelayMs: 10, // 테스트 속도를 위해 짧게 설정
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("네트워크 오류는 재시도해야 함", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValue("success");

    const result = await withGeminiRetry(mockFn, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("4xx 클라이언트 오류는 재시도하지 않아야 함", async () => {
    const mockFn = vi.fn().mockRejectedValue({ response: { status: 400 } });

    await expect(
      withGeminiRetry(mockFn, { maxRetries: 3, initialDelayMs: 10 })
    ).rejects.toThrow(GeminiRetryError);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("최대 재시도 횟수를 초과하면 실패해야 함", async () => {
    const mockFn = vi.fn().mockRejectedValue({ response: { status: 503 } });

    await expect(
      withGeminiRetry(mockFn, { maxRetries: 2, initialDelayMs: 10 })
    ).rejects.toThrow(GeminiRetryError);

    expect(mockFn).toHaveBeenCalledTimes(3); // 최초 1회 + 재시도 2회
  });

  it("500번대 서버 오류는 재시도해야 함", async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValue("success");

    const result = await withGeminiRetry(mockFn, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});

describe("isRetryableStatusCode", () => {
  it("429는 재시도 가능해야 함", () => {
    expect(isRetryableStatusCode(429)).toBe(true);
  });

  it("500번대는 재시도 가능해야 함", () => {
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(504)).toBe(true);
  });

  it("4xx 클라이언트 오류는 재시도 불가능해야 함", () => {
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
  });

  it("2xx 성공 응답은 재시도 불가능해야 함", () => {
    expect(isRetryableStatusCode(200)).toBe(false);
    expect(isRetryableStatusCode(201)).toBe(false);
  });
});
