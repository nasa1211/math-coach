import { GoogleGenerativeAIAbortError } from "@google/generative-ai";

export function isModelTimeout(error: unknown): boolean {
  return error instanceof GoogleGenerativeAIAbortError;
}
