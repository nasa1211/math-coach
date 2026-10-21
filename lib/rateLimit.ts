/**
 * 간단한 in-memory rate limiter
 * IP 기반으로 요청 제한
 */

import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  requests: number;
  windowMs: number;
}

// IP별 요청 기록 저장 (in-memory)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * 주기적으로 만료된 엔트리 정리 (메모리 누수 방지)
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(ip);
    }
  }
}

// 10분마다 정리
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredEntries, 10 * 60 * 1000);
}

/**
 * 클라이언트 IP 추출
 */
function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare 등의 프록시 헤더 확인
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // 폴백: 고정 IP (localhost 등)
  return "unknown";
}

/**
 * Rate limit 체크 및 응답 생성
 * @returns 제한 초과 시 NextResponse, 정상이면 null
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): NextResponse | null {
  const ip = getClientIP(request);
  const now = Date.now();

  let entry = rateLimitStore.get(ip);

  // 새 윈도우 시작 또는 기존 윈도우 만료
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(ip, entry);
    return null; // 정상
  }

  // 기존 윈도우 내에서 카운트 증가
  entry.count += 1;

  // 제한 초과
  if (entry.count > config.requests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      {
        error: "요청 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.requests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(entry.resetAt),
        },
      }
    );
  }

  // 정상: 남은 요청 수 반환
  return null;
}

/**
 * 테스트용: rate limit 저장소 초기화
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * 테스트용: 특정 IP의 rate limit 정보 조회
 */
export function getRateLimitInfo(ip: string): RateLimitEntry | undefined {
  return rateLimitStore.get(ip);
}
