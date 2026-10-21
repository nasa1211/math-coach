import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateServerEnv, EnvValidationError } from "./envValidation";

describe("validateServerEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 환경 변수 초기화
    process.env.GEMINI_API_KEY = "AIzaTestKey123456789";
    process.env.ACCESS_PASSCODE = "testpasscode";
  });

  afterEach(() => {
    // 원래 환경 변수 복원
    process.env = { ...originalEnv };
  });

  it("모든 필수 환경 변수가 설정되어 있으면 성공해야 함", () => {
    const result = validateServerEnv();

    expect(result).toEqual({
      GEMINI_API_KEY: "AIzaTestKey123456789",
      ACCESS_PASSCODE: "testpasscode",
    });
  });

  it("GEMINI_API_KEY가 없으면 오류를 던져야 함", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => validateServerEnv()).toThrow(EnvValidationError);
    expect(() => validateServerEnv()).toThrow(/GEMINI_API_KEY/);
  });

  it("ACCESS_PASSCODE가 없으면 오류를 던져야 함", () => {
    delete process.env.ACCESS_PASSCODE;

    expect(() => validateServerEnv()).toThrow(EnvValidationError);
    expect(() => validateServerEnv()).toThrow(/ACCESS_PASSCODE/);
  });

  it("빈 문자열은 없는 것으로 간주해야 함", () => {
    process.env.GEMINI_API_KEY = "   ";

    expect(() => validateServerEnv()).toThrow(EnvValidationError);
  });

  it("공백이 있는 값은 trim되어야 함", () => {
    process.env.GEMINI_API_KEY = "  AIzaTestKey  ";
    process.env.ACCESS_PASSCODE = "  testpass  ";

    const result = validateServerEnv();

    expect(result.GEMINI_API_KEY).toBe("AIzaTestKey");
    expect(result.ACCESS_PASSCODE).toBe("testpass");
  });
});
