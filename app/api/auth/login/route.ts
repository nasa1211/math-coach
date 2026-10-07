import { NextResponse } from "next/server";
import {
  passcodeMatches,
  readAccessPasscode,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/accessSession";

export async function POST(req: Request) {
  const passcode = readAccessPasscode();
  if (!passcode) {
    return NextResponse.json(
      { error: "서버 접근 암호(ACCESS_PASSCODE)가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code || !passcodeMatches(code, passcode)) {
    return NextResponse.json({ error: "접근 암호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, signSession(passcode), sessionCookieOptions);
  return response;
}
