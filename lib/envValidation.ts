/**
 * 환경 변수 검증
 * 빌드 시점에 필수 환경 변수가 설정되었는지 확인
 */

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * 서버 환경 변수 검증
 * API 라우트 진입 시 호출하여 필수 환경 변수 확인
 */
export function validateServerEnv(): {
  GEMINI_API_KEY: string;
  ACCESS_PASSCODE: string;
} {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
  const ACCESS_PASSCODE = process.env.ACCESS_PASSCODE?.trim();

  if (!GEMINI_API_KEY) {
    throw new EnvValidationError(
      "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. " +
        "Vercel 대시보드에서 환경 변수를 추가하거나 .env.local 파일을 생성하세요."
    );
  }

  if (!ACCESS_PASSCODE) {
    throw new EnvValidationError(
      "ACCESS_PASSCODE 환경변수가 설정되지 않았습니다. " +
        "Vercel 대시보드에서 환경 변수를 추가하거나 .env.local 파일을 생성하세요."
    );
  }

  // API 키 형식 간단 검증 (Gemini API 키는 AIza로 시작)
  if (!GEMINI_API_KEY.startsWith("AIza")) {
    console.warn(
      "⚠️  GEMINI_API_KEY 형식이 올바르지 않을 수 있습니다. Gemini API 키는 'AIza'로 시작해야 합니다."
    );
  }

  return { GEMINI_API_KEY, ACCESS_PASSCODE };
}
