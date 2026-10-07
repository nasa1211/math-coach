import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readAccessPasscode, SESSION_COOKIE, sessionMatches } from "@/lib/accessSession";

export async function GET() {
  const passcode = readAccessPasscode();
  if (!passcode) {
    return NextResponse.json({ ok: false });
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return NextResponse.json({ ok: sessionMatches(token, passcode) });
}
