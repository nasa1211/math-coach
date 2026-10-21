// 공유 상수 정의

/**
 * 이미지 업로드 최대 크기 (4MB)
 * 클라이언트와 서버에서 동일하게 사용
 */
export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

/**
 * API 요청 Rate Limit 설정
 */
export const RATE_LIMITS = {
  /** 분석 API: 분당 요청 수 */
  ANALYZE: {
    requests: 10,
    windowMs: 60 * 1000, // 1분
  },
  /** 로그인 API: 분당 요청 수 (더 엄격) */
  LOGIN: {
    requests: 5,
    windowMs: 60 * 1000, // 1분
  },
} as const;

/**
 * Gemini API 재시도 설정
 */
export const GEMINI_RETRY = {
  /** 최대 재시도 횟수 */
  maxRetries: 3,
  /** 초기 대기 시간 (ms) */
  initialDelayMs: 1000,
  /** 재시도할 HTTP 상태 코드 */
  retryableStatusCodes: [429, 500, 502, 503, 504],
} as const;
