import { NextRequest, NextResponse } from "next/server";
import {
  passcodeMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/accessSession";
import { RATE_LIMITS } from "@/lib/constants";
import { validateServerEnv } from "@/lib/envValidation";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  // Rate limiting 체크 (로그인은 더 엄격하게)
  const rateLimitResponse = checkRateLimit(req, RATE_LIMITS.LOGIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // 환경 변수 검증 (조기 실패)
  const { ACCESS_PASSCODE } = validateServerEnv();

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code || !passcodeMatches(code, ACCESS_PASSCODE)) {
    return NextResponse.json({ error: "접근 암호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, signSession(ACCESS_PASSCODE), sessionCookieOptions);
  return response;
}
