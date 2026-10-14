const QUERY_KEY_PATTERN = /([?&]key=)[^&\s]+/gi;
const GEMINI_KEY_PATTERN = /AIza[0-9A-Za-z\-_]{10,}/g;
const LONG_BLOB_PATTERN = /[A-Za-z0-9+/]{80,}={0,2}/g;

export function collectLogSecrets(): string[] {
  return [process.env.GEMINI_API_KEY, process.env.ACCESS_PASSCODE].filter(
    (value): value is string => Boolean(value),
  );
}

export function sanitizeForLog(value: unknown, secrets: readonly string[] = []): string {
  let text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  text = text.replace(QUERY_KEY_PATTERN, "$1[redacted]");
  text = text.replace(GEMINI_KEY_PATTERN, "[redacted]");
  for (const secret of secrets) {
    if (!secret) continue;
    text = text.split(secret).join("[redacted]");
  }
  text = text.replace(LONG_BLOB_PATTERN, "[redacted-blob]");
  return text.slice(0, 500);
}

export function usageFields(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
} | null): {
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  totalTokenCount: number | null;
} {
  return {
    promptTokenCount: usage?.promptTokenCount ?? null,
    candidatesTokenCount: usage?.candidatesTokenCount ?? null,
    totalTokenCount: usage?.totalTokenCount ?? null,
  };
}
