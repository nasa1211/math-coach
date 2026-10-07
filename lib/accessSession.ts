import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "math_coach_session";

export function readAccessPasscode(): string | null {
  const value = process.env.ACCESS_PASSCODE?.trim();
  return value ? value : null;
}

export function signSession(passcode: string): string {
  return createHmac("sha256", passcode).update("math-coach-session-v1").digest("hex");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function passcodeMatches(input: string, passcode: string): boolean {
  return timingSafeEqual(digest(input), digest(passcode));
}

export function sessionMatches(token: string | undefined, passcode: string): boolean {
  if (!token) return false;
  const expected = signSession(passcode);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
