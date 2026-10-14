import { parseModelChoice, type ModelChoice } from "@/lib/modelChoice";
import { storageFailureMessage, type SaveResult } from "@/lib/storageFailure";

export const MODEL_STORAGE_KEY = "math_coach_model";
export const FONT_SCALE_KEY = "font_scale";
const SETTINGS_EVENT = "math-coach-settings";

export function subscribeClientSettings(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(SETTINGS_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SETTINGS_EVENT, callback);
  };
}

function publishClientSettings() {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function readModelChoiceSnapshot(): ModelChoice {
  if (typeof window === "undefined") return "flash";
  try {
    return parseModelChoice(localStorage.getItem(MODEL_STORAGE_KEY));
  } catch {
    return "flash";
  }
}

export function writeModelChoice(choice: ModelChoice): SaveResult {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, choice);
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "settings") };
  }
  publishClientSettings();
  return { ok: true };
}

export function readFontScaleSnapshot(): string {
  if (typeof window === "undefined") return "1.0";
  try {
    return localStorage.getItem(FONT_SCALE_KEY) || "1.0";
  } catch {
    return "1.0";
  }
}

export function writeFontScale(scale: string): SaveResult {
  try {
    localStorage.setItem(FONT_SCALE_KEY, scale);
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "settings") };
  }
  document.documentElement.style.setProperty("--font-scale", scale);
  publishClientSettings();
  return { ok: true };
}

export function subscribeDarkClass(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function readDarkClassSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function writeDarkClass(nextDark: boolean): SaveResult {
  const root = document.documentElement;
  if (nextDark) root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("theme", nextDark ? "dark" : "light");
  } catch (error) {
    return { ok: false, message: storageFailureMessage(error, "settings") };
  }
  return { ok: true };
}
