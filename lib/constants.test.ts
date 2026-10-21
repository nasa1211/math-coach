import { describe, it, expect } from "vitest";
import { MAX_IMAGE_SIZE, RATE_LIMITS, GEMINI_RETRY } from "./constants";

describe("constants", () => {
  describe("MAX_IMAGE_SIZE", () => {
    it("4MB로 설정되어 있어야 함", () => {
      expect(MAX_IMAGE_SIZE).toBe(4 * 1024 * 1024);
    });
  });

  describe("RATE_LIMITS", () => {
    it("분석 API는 분당 10회 제한이어야 함", () => {
      expect(RATE_LIMITS.ANALYZE.requests).toBe(10);
      expect(RATE_LIMITS.ANALYZE.windowMs).toBe(60 * 1000);
    });

    it("로그인 API는 분당 5회로 더 엄격해야 함", () => {
      expect(RATE_LIMITS.LOGIN.requests).toBe(5);
      expect(RATE_LIMITS.LOGIN.windowMs).toBe(60 * 1000);
    });

    it("로그인 제한이 분석 제한보다 엄격해야 함", () => {
      expect(RATE_LIMITS.LOGIN.requests).toBeLessThan(RATE_LIMITS.ANALYZE.requests);
    });
  });

  describe("GEMINI_RETRY", () => {
    it("최대 3회 재시도해야 함", () => {
      expect(GEMINI_RETRY.maxRetries).toBe(3);
    });

    it("초기 대기 시간은 1초여야 함", () => {
      expect(GEMINI_RETRY.initialDelayMs).toBe(1000);
    });

    it("429, 5xx 상태 코드에 대해 재시도해야 함", () => {
      expect(GEMINI_RETRY.retryableStatusCodes).toContain(429);
      expect(GEMINI_RETRY.retryableStatusCodes).toContain(500);
      expect(GEMINI_RETRY.retryableStatusCodes).toContain(502);
      expect(GEMINI_RETRY.retryableStatusCodes).toContain(503);
      expect(GEMINI_RETRY.retryableStatusCodes).toContain(504);
    });

    it("4xx 클라이언트 오류는 재시도하지 않아야 함", () => {
      expect(GEMINI_RETRY.retryableStatusCodes).not.toContain(400);
      expect(GEMINI_RETRY.retryableStatusCodes).not.toContain(401);
      expect(GEMINI_RETRY.retryableStatusCodes).not.toContain(404);
    });
  });
});
