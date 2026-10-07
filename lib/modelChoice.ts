export type ModelChoice = "pro" | "flash";

export function parseModelChoice(value: unknown): ModelChoice {
  return value === "pro" ? "pro" : "flash";
}
