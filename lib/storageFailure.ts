export type SaveResult = { ok: true } | { ok: false; message: string };

export class StorageSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSaveError";
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return name === "QuotaExceededError" || code === 22 || code === 1014;
}

export function storageFailureMessage(
  error: unknown,
  target: "history" | "notes" | "diagnosis" | "settings",
): string {
  const quota = isQuotaError(error);
  if (target === "history") {
    return quota
      ? "저장 공간이 부족해 분석 기록을 저장하지 못했습니다. 최근 기록을 삭제한 뒤 다시 시도해 주세요. 이번 분석 결과는 화면에 남아 있습니다."
      : "분석 기록을 저장하지 못했습니다. 이번 분석 결과는 화면에 남아 있습니다.";
  }
  if (target === "notes") {
    return quota
      ? "저장 공간이 부족해 오답 노트를 저장하지 못했습니다. 오답 노트를 일부 삭제한 뒤 다시 시도해 주세요."
      : "오답 노트를 저장하지 못했습니다.";
  }
  if (target === "diagnosis") {
    return quota
      ? "저장 공간이 부족해 진단 결과를 저장하지 못했습니다. 화면에 보인 진단은 새로고침하면 사라질 수 있습니다."
      : "진단 결과를 저장하지 못했습니다. 화면에 보인 진단은 새로고침하면 사라질 수 있습니다.";
  }
  return quota ? "저장 공간이 부족해 설정을 저장하지 못했습니다." : "설정을 저장하지 못했습니다.";
}
