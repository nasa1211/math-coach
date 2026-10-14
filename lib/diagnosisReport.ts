import type { WrongNote } from "@/lib/wrongNote";

export interface WeakConcept {
  concept: string;
  reason: string;
}

export interface DiagnosisReport {
  overall_status: string;
  top_weak_concepts: WeakConcept[];
  prescription: string;
}

export const DIAGNOSIS_FORMAT_ERROR =
  "진단 결과 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.";

export const DIAGNOSIS_FAILED_ERROR =
  "학습 진단을 마치지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** buildDiagnosisPrompt의 지시문을 바꾸면 값을 올려 저장된 진단이 재사용되지 않게 한다. */
export const DIAGNOSIS_PROMPT_VERSION = "v1";

const FIELD_LIMIT = 400;

function clip(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > FIELD_LIMIT ? `${text.slice(0, FIELD_LIMIT)}…` : text;
}

export function buildDiagnosisPrompt(notes: WrongNote[]): string {
  const items = notes.slice(0, 40).map((note, index) => ({
    index: index + 1,
    problem_number: clip(note.problem_number),
    concept: clip(note.concept),
    problem_text: clip(note.problem_text),
    student_answer: clip(note.student_answer),
    correct_answer: clip(note.correct_answer),
    error_analysis: clip(note.error_analysis),
  }));

  return `
당신은 대한민국 초·중등 수학 학부모를 돕는 홈코치입니다.
아래는 아이가 실제로 틀린 문항만 모은 오답 기록입니다. 미작성이나 판독불가는 포함되어 있지 않습니다.
기록만 근거로 학습 상태를 진단하고, 순수 JSON만 반환하세요.

오답 기록:
${JSON.stringify(items)}

작성 원칙:
- 부모에게 말하듯 짧고 구체적인 한국어로 씁니다.
- 기록에 없는 단원이나 실수를 만들지 않습니다.
- 수식이 필요하면 $...$로 감쌉니다.
- top_weak_concepts는 기록에서 반복되거나 우선 복습이 필요한 개념 최대 3개입니다.

{
  "overall_status": "현재 학습 상태 총평",
  "top_weak_concepts": [
    { "concept": "취약 개념", "reason": "이 개념을 먼저 볼 이유" }
  ],
  "prescription": "부모님을 위한 복습 순서와 지도 방법"
}
`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseDiagnosisReport(parsed: unknown): DiagnosisReport | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as {
    overall_status?: unknown;
    top_weak_concepts?: unknown;
    prescription?: unknown;
  };
  const overall = asText(record.overall_status);
  const prescription = asText(record.prescription);
  if (!overall || !prescription || !Array.isArray(record.top_weak_concepts)) return null;

  const concepts = record.top_weak_concepts
    .map((item) => {
      if (typeof item === "string") return { concept: item.trim(), reason: "" };
      if (!item || typeof item !== "object") return null;
      const concept = asText((item as { concept?: unknown }).concept);
      if (!concept) return null;
      return { concept, reason: asText((item as { reason?: unknown }).reason) };
    })
    .filter((item): item is WeakConcept => item !== null)
    .slice(0, 3);

  if (concepts.length === 0) return null;
  return { overall_status: overall, top_weak_concepts: concepts, prescription };
}
