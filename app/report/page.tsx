"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import MathText from "@/components/MathText";
import { fetchWithTimeout } from "@/lib/analysisTimeout";
import { MODEL_STORAGE_KEY } from "@/lib/clientSettings";
import { diagnosisCacheKey, planDiagnosisRequest, readDiagnosisCache, writeDiagnosisCache } from "@/lib/diagnosisCache";
import { DIAGNOSIS_PROMPT_VERSION, type DiagnosisReport } from "@/lib/diagnosisReport";
import { MODEL_ID, parseModelChoice } from "@/lib/modelChoice";
import { WRONG_NOTE_DELETE_CONFIRM } from "@/lib/recordDeletion";
import {
  StorageSaveError,
  classifyErrorPattern,
  clearWrongNotes,
  conceptCounts,
  errorPatternLabel,
  filterNotesByPeriod,
  getWrongNotesServerSnapshot,
  getWrongNotesSnapshot,
  patternCounts,
  subscribeWrongNotes,
  type ErrorPattern,
  type NotePeriod,
} from "@/lib/wrongNote";
const NOTE_PAGE_SIZE = 5;

const PERIODS: { id: NotePeriod; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "7d", label: "최근 7일" },
  { id: "30d", label: "최근 30일" },
];

const PRIMARY_PATTERNS: ErrorPattern[] = ["calculation", "concept", "reading"];

export default function ReportPage() {
  const notes = useSyncExternalStore(subscribeWrongNotes, getWrongNotesSnapshot, getWrongNotesServerSnapshot);
  const [period, setPeriod] = useState<NotePeriod>("all");
  const [visibleCount, setVisibleCount] = useState(NOTE_PAGE_SIZE);
  const [report, setReport] = useState<DiagnosisReport | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = notes ? filterNotesByPeriod(notes, period) : [];
  const concepts = conceptCounts(filtered).slice(0, 3);
  const patternById = new Map(patternCounts(filtered).map((item) => [item.pattern, item.count]));
  const patternCards = [
    ...PRIMARY_PATTERNS.map((pattern) => ({
      pattern,
      label: errorPatternLabel(pattern),
      count: patternById.get(pattern) ?? 0,
    })),
    ...(patternById.get("other")
      ? [{ pattern: "other" as const, label: errorPatternLabel("other"), count: patternById.get("other") ?? 0 }]
      : []),
  ];
  const maxConcept = concepts[0]?.count ?? 1;
  const visibleNotes = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleNotes.length;

  const selectPeriod = (next: NotePeriod) => {
    if (next === period) return;
    setPeriod(next);
    setVisibleCount(NOTE_PAGE_SIZE);
    setReport(null);
    setFromCache(false);
    setErrorMsg(null);
  };

  const requestDiagnosis = async (force: boolean) => {
    if (filtered.length === 0) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const modelChoice = parseModelChoice(localStorage.getItem(MODEL_STORAGE_KEY));
      const notes = filtered.slice(0, 40);
      const key = await diagnosisCacheKey({
        modelId: MODEL_ID[modelChoice],
        promptVersion: DIAGNOSIS_PROMPT_VERSION,
        notes,
      });
      const cached = readDiagnosisCache(key);
      if (planDiagnosisRequest(force, cached) === "cache" && cached) {
        setReport(cached);
        setFromCache(true);
        return;
      }

      const res = await fetchWithTimeout("/api/analyze-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wrongs: notes,
          modelChoice,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as DiagnosisReport & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "학습 진단을 마치지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (!data.overall_status || !Array.isArray(data.top_weak_concepts) || !data.prescription) {
        throw new Error("진단 결과 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.");
      }
      const nextReport = {
        overall_status: data.overall_status,
        top_weak_concepts: data.top_weak_concepts,
        prescription: data.prescription,
      };
      setReport(nextReport);
      setFromCache(false);
      const saved = writeDiagnosisCache(key, nextReport);
      if (!saved.ok) alert(saved.message);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : "학습 진단을 마치지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (!confirm(WRONG_NOTE_DELETE_CONFIRM)) return;
    try {
      clearWrongNotes();
    } catch (error) {
      if (error instanceof StorageSaveError) {
        alert(error.message);
        return;
      }
      throw error;
    }
    setReport(null);
    setFromCache(false);
    setErrorMsg(null);
    setVisibleCount(NOTE_PAGE_SIZE);
  };

  const share = (count: number) => (filtered.length === 0 ? 0 : Math.round((count / filtered.length) * 100));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 antialiased font-sans ios-safe-content-pb">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-xl mx-auto px-2 sm:px-0 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">오답 학습 진단</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              틀린 문항만 모아 취약 개념을 봅니다. 오답 노트를 지워도 최근 코칭 기록은 남습니다.
            </p>
          </div>
          <Link
            href="/"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800"
          >
            홈으로
          </Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-2 sm:px-0 py-4 sm:py-6 space-y-4">
        {notes === null ? (
          <p className="text-sm text-slate-400">오답 기록을 불러오는 중입니다.</p>
        ) : notes.length === 0 ? (
          <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <p className="text-base font-bold">아직 쌓인 오답이 없습니다</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              채점 모드에서 틀린 문항이 나오면 이곳에 누적됩니다. 미작성과 판독불가는 포함하지 않습니다.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold"
            >
              문제 촬영하러 가기
            </Link>
          </section>
        ) : (
          <>
            <section className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">취약 개념 TOP 3</h2>
                <span className="text-xs font-semibold text-slate-400">오답 {filtered.length}개</span>
              </div>
              {concepts.length === 0 ? (
                <p className="text-xs text-slate-400 leading-relaxed">이 기간에는 집계할 오답이 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {concepts.map((item) => (
                    <li key={item.concept}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{item.concept}</span>
                        <span className="text-slate-400 shrink-0">{item.count}회</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.max(8, (item.count / maxConcept) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h2 className="text-sm font-bold">오답 패턴</h2>
              <div className="grid grid-cols-2 gap-3">
                {patternCards.map((item) => (
                  <div
                    key={item.pattern}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3.5 sm:p-5"
                  >
                    <p className="text-[11px] text-slate-400">{item.label}</p>
                    <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">{share(item.count)}%</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.count}개</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <button
                type="button"
                onClick={() => requestDiagnosis(report !== null)}
                disabled={loading || filtered.length === 0}
                className="w-full min-h-12 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-2xl text-sm font-bold"
              >
                {loading ? "진단 중..." : report ? "다시 진단" : "AI 진단 받기"}
              </button>
              {fromCache && report && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  같은 오답과 같은 모델의 저장된 진단입니다. 다시 진단하면 새로 분석합니다.
                </p>
              )}
              {errorMsg && <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{errorMsg}</p>}
              {report && (
                <div className="space-y-3 pt-1">
                  <article className="rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 p-3.5 sm:p-5 space-y-1.5">
                    <h3 className="text-xs font-bold text-indigo-700 dark:text-indigo-300">학습 상태 총평</h3>
                    <div className="text-sm leading-relaxed">
                      <MathText content={report.overall_status} />
                    </div>
                  </article>
                  <article className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 sm:p-5 space-y-2">
                    <h3 className="text-xs font-bold text-slate-500">먼저 보완할 개념</h3>
                    <ol className="space-y-2">
                      {report.top_weak_concepts.map((item, index) => (
                        <li key={`${item.concept}-${index}`} className="text-sm leading-relaxed">
                          <span className="font-bold">{index + 1}. {item.concept}</span>
                          {item.reason && (
                            <span className="block text-slate-600 dark:text-slate-300 mt-0.5">
                              <MathText content={item.reason} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </article>
                  <article className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3.5 sm:p-5 space-y-1.5">
                    <h3 className="text-xs font-bold text-amber-800 dark:text-amber-200">부모님 학습 처방</h3>
                    <div className="text-sm leading-relaxed">
                      <MathText content={report.prescription} />
                    </div>
                  </article>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-bold min-w-0">오답 노트</h2>
                <button
                  type="button"
                  onClick={handleClear}
                  className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-400 min-h-11 px-2 py-1.5"
                >
                  전체 삭제
                </button>
              </div>
              <div
                className="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800"
                role="tablist"
                aria-label="기간"
              >
                {PERIODS.map((item) => {
                  const active = period === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => selectPeriod(item.id)}
                      className={`flex-1 min-h-11 rounded-xl text-sm font-bold transition-colors ${
                        active
                          ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">이 기간에는 틀린 문항이 없습니다.</p>
              ) : (
                <>
                  {visibleNotes.map((note, index) => (
                    <article
                      key={`${note.timestamp}-${note.problem_number}-${index}`}
                      className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold">{note.problem_number || `${index + 1}번`}</span>
                        <span className="text-[11px] font-bold text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
                          {errorPatternLabel(classifyErrorPattern(note.error_analysis))}
                        </span>
                      </div>
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-300">{note.concept}</p>
                      <div className="text-sm">
                        <MathText content={note.problem_text} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="min-w-0 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 sm:p-5">
                          <span className="block text-slate-400 mb-0.5">아이 답</span>
                          <MathText content={note.student_answer} />
                        </div>
                        <div className="min-w-0 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 p-3.5 sm:p-5">
                          <span className="block text-indigo-400 mb-0.5">정답</span>
                          <MathText content={note.correct_answer} />
                        </div>
                      </div>
                      {note.error_analysis && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          <MathText content={note.error_analysis} />
                        </div>
                      )}
                    </article>
                  ))}
                  {remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((count) => count + NOTE_PAGE_SIZE)}
                      className="w-full min-h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                    >
                      더보기 ({remaining}개)
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
