import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, resetRateLimitStore } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("첫 요청은 통과해야 함", () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });

    const response = checkRateLimit(request, { requests: 5, windowMs: 60000 });
    expect(response).toBeNull();
  });

  it("제한 이내 요청은 모두 통과해야 함", () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.2" },
    });

    for (let i = 0; i < 5; i++) {
      const response = checkRateLimit(request, { requests: 5, windowMs: 60000 });
      expect(response).toBeNull();
    }
  });

  it("제한 초과 시 429 응답을 반환해야 함", async () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.3" },
    });

    // 5번까지 통과
    for (let i = 0; i < 5; i++) {
      checkRateLimit(request, { requests: 5, windowMs: 60000 });
    }

    // 6번째는 차단
    const response = checkRateLimit(request, { requests: 5, windowMs: 60000 });
    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);

    const json = await response?.json();
    expect(json).toHaveProperty("error");
    expect(json).toHaveProperty("retryAfter");
  });

  it("다른 IP는 독립적으로 카운트되어야 함", () => {
    const request1 = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.4" },
    });
    const request2 = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.5" },
    });

    // 첫 번째 IP로 5번 요청
    for (let i = 0; i < 5; i++) {
      checkRateLimit(request1, { requests: 5, windowMs: 60000 });
    }

    // 두 번째 IP는 여전히 통과해야 함
    const response = checkRateLimit(request2, { requests: 5, windowMs: 60000 });
    expect(response).toBeNull();
  });

  it("rate limit 헤더가 설정되어야 함", async () => {
    const request = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "192.168.1.6" },
    });

    // 제한까지 요청
    for (let i = 0; i < 5; i++) {
      checkRateLimit(request, { requests: 5, windowMs: 60000 });
    }

    const response = checkRateLimit(request, { requests: 5, windowMs: 60000 });
    expect(response?.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(response?.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
