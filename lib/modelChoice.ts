export type ModelChoice = "pro" | "flash";

export function parseModelChoice(value: unknown): ModelChoice {
  return value === "flash" ? "flash" : "pro";
}
