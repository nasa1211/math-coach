export type ModelChoice = "pro" | "flash";

export const MODEL_ID: Record<ModelChoice, string> = {
  pro: "gemini-3.1-pro-preview",
  flash: "gemini-3.6-flash",
};

export function parseModelChoice(value: unknown): ModelChoice {
  return value === "pro" ? "pro" : "flash";
}
