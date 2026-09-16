"use client";

import { useState, useEffect, ChangeEvent } from "react";

interface ProblemItem {
  problem_number: string;
  problem_text: string;
  correct_answer: string;
  solution_steps: string[];
  concept: string;
  // 채점 모드 전용 필드
  student_answer?: string;
  is_correct?: boolean;
  error_analysis?: string;
  parent_script?: string[];
  twin_problem?: {
    question: string;
    answer: string;
  };
  // 사전 지도 모드 전용 필드
  teaching_tip?: string;
}

interface AnalysisResponse {
  mode?: "grade" | "guide";
  problems: ProblemItem[];
}

const GRADE_LOADING_STEPS = [
  "문제집 이미지와 손글씨 풀이를 스캔하고 있습니다...",
  "초·중등 교육과정 단원을 분류하고 있습니다...",
  "정답 도출 수식과 아이 풀이를 정밀 대조하고 있습니다...",
  "학부모용 코칭 대화 가이드와 쌍둥이 문제를 생성하고 있습니다...",
];

const GUIDE_LOADING_STEPS = [
  "깨끗한 문제집 이미지를 스캔하고 있습니다...",
  "단원별 핵심 공식과 개념 원리를 정리하고 있습니다...",
  "단계별 정석 풀이법을 도출하고 있습니다...",
  "아이가 자주 빠지는 함정과 부모 지도 팁을 정리하고 있습니다...",
];

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      const MAX_WIDTH = 1400;
      const MAX_HEIGHT = 1400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => reject(file);
  });
}

export default function MathCoachPage() {
  const [activeMode, setActiveMode] = useState<"grade" | "guide">("grade");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [results, setResults] = useState<ProblemItem[] | null>(null);
  const [resultMode, setResultMode] = useState<"grade" | "guide">("grade");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentLoadingSteps =
    activeMode === "guide" ? GUIDE_LOADING_STEPS : GRADE_LOADING_STEPS;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setStepIdx(0);
      interval = setInterval(() => {
        setStepIdx((prev) => (prev + 1) % currentLoadingSteps.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading, currentLoadingSteps.length]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setResults(null);
      setErrorMsg(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const compressedBlob = await compressImage(file);
      const formData = new FormData();
      formData.append("image", compressedBlob, "upload.jpg");
      formData.append("mode", activeMode);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 오류 (상태코드: ${res.status})`);
      }

      const data: AnalysisResponse = await res.json();
      setResults(data.problems || []);
      setResultMode(data.mode || activeMode);
    } catch (err: any) {
      console.error("전송 에러:", err);
      setErrorMsg(err.message || "분석 요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
      {/* 상단 네비게이션 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📐</span>
            <span className="text-xl font-extrabold text-indigo-700 tracking-tight">
              초·중등 수학 홈코치 AI
            </span>
          </div>
          <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
            초·중등 전 학년 수학 채점 & 학부모 지도 코칭 리포트
          </span>
        </div>
      </header>

      {/* 중앙 메인 컨테이너 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* 좌측 패널: 모드 선택 + 업로드 */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            {/* 모드 전환 탭 */}
            <div className="bg-slate-200/80 p-1.5 rounded-2xl flex gap-1 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setActiveMode("grade");
                  setResults(null);
                }}
                disabled={loading}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === "grade"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>✏️</span>
                <span>채점 & 오답 코칭</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveMode("guide");
                  setResults(null);
                }}
                disabled={loading}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === "guide"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📖</span>
                <span>사전 지도 가이드</span>
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-900">
                  {activeMode === "grade"
                    ? "풀이 완료된 문제집 촬영"
                    : "아직 풀지 않은 문제집 촬영"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {activeMode === "grade"
                    ? "아이의 손글씨 풀이를 스캔해 정오답과 오개념을 짚어줍니다."
                    : "부모님이 먼저 훑어볼 수 있도록 핵심 원리와 정석 풀이를 1초 만에 요약합니다."}
                </p>
              </div>

              <label
                htmlFor="camera-input"
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 transition-all text-center group ${
                  loading
                    ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                    : "border-indigo-200 cursor-pointer hover:bg-indigo-50/40 hover:border-indigo-400"
                }`}
              >
                {preview ? (
                  <div className="space-y-3 w-full">
                    <img
                      src={preview}
                      alt="선택된 문제"
                      className={`max-h-72 w-full object-contain rounded-lg shadow-sm transition-opacity ${
                        loading ? "opacity-50" : "opacity-100"
                      }`}
                    />
                    {!loading && (
                      <span className="text-xs text-indigo-600 font-semibold inline-block group-hover:underline">
                        다른 사진으로 변경하기
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="py-6">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 group-hover:scale-105 transition-transform">
                      📷
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      문제집 사진 촬영 또는 선택
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeMode === "grade"
                        ? "손글씨가 선명하게 나오도록 촬영해 주세요"
                        : "문제 내용이 전체적으로 보이도록 촬영해 주세요"}
                    </p>
                  </div>
                )}
              </label>

              <input
                id="camera-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
              />

              <button
                onClick={handleAnalyze}
                disabled={!file || loading}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm flex justify-center items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>
                      {activeMode === "guide"
                        ? "초고속 티칭 가이드 생성 중..."
                        : "정밀 채점 및 분석 중..."}
                    </span>
                  </div>
                ) : activeMode === "guide" ? (
                  "부모용 사전 지도 가이드 받기"
                ) : (
                  "전체 문항 채점 & 오답 코칭 보기"
                )}
              </button>

              {errorMsg && (
                <div className="mt-3 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 text-center">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          {/* 우측 패널: 분석 결과 영역 */}
          <div className="lg:col-span-7">
            {loading ? (
              <div className="bg-white p-8 rounded-2xl border border-indigo-100 shadow-sm space-y-6">
                <div className="flex flex-col items-center justify-center text-center py-6">
                  <div className="relative flex items-center justify-center w-20 h-20 mb-5">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                    <span className="text-3xl animate-pulse">
                      {activeMode === "guide" ? "📖" : "🤖"}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-800">
                    {activeMode === "guide"
                      ? "문제 원리와 풀이 팁을 빠르게 요약하고 있습니다"
                      : "AI가 손글씨와 문제를 정밀 분석하고 있습니다"}
                  </h3>

                  <p className="text-xs text-indigo-600 font-medium mt-2 transition-all duration-300 min-h-[1.25rem]">
                    {currentLoadingSteps[stepIdx]}
                  </p>
                </div>
              </div>
            ) : results ? (
              <div className="space-y-6">
                {/* 결과 헤더 */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span>
                      {resultMode === "guide"
                        ? "📖 사전 지도 가이드"
                        : "✏️ 채점 & 코칭 리포트"}
                    </span>
                    <span className="text-indigo-600 text-sm font-normal">
                      ({results.length}개 문항)
                    </span>
                  </h3>
                  {resultMode === "grade" && (
                    <div className="flex gap-2">
                      <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-md font-semibold border border-green-200">
                        정답 {results.filter((p) => p.is_correct).length}
                      </span>
                      <span className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-md font-semibold border border-red-200">
                        오답 {results.filter((p) => !p.is_correct).length}
                      </span>
                    </div>
                  )}
                </div>

                {/* 문제 목록 */}
                {results.map((prob, idx) => (
                  <article
                    key={idx}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:border-slate-300 transition-colors"
                  >
                    {/* 상단 문항 정보 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {prob.problem_number || `${idx + 1}번`}
                        </span>
                        <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">
                          {prob.concept}
                        </span>
                      </div>
                      {resultMode === "grade" && (
                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full ${
                            prob.is_correct
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {prob.is_correct ? "정답" : "오답 코칭 필요"}
                        </span>
                      )}
                    </div>

                    {/* 문제 요약 */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed font-mono">
                      {prob.problem_text}
                    </div>

                    {/* 모드별 차별화 영역 */}
                    {resultMode === "guide" ? (
                      /* [가이드 모드]: 정답 + 단계별 정석 풀이 + 부모 지도 팁 */
                      <div className="space-y-3">
                        <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex items-center justify-between">
                          <span className="text-xs font-medium text-indigo-900">
                            이 문제의 정답
                          </span>
                          <span className="text-sm font-extrabold text-indigo-700">
                            {prob.correct_answer}
                          </span>
                        </div>

                        {prob.solution_steps && prob.solution_steps.length > 0 && (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/70 text-xs">
                            <span className="font-bold text-slate-800 block mb-2">
                              📌 단계별 정석 풀이법
                            </span>
                            <ul className="space-y-1.5 text-slate-700">
                              {prob.solution_steps.map((step, sIdx) => (
                                <li key={sIdx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-indigo-600 font-bold shrink-0">•</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {prob.teaching_tip && (
                          <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 text-xs">
                            <span className="font-bold text-amber-950 block mb-1.5 flex items-center gap-1.5">
                              <span>💡</span> 아이 지도 시 함정 포인트 & 팁
                            </span>
                            <p className="text-amber-900 leading-relaxed">
                              {prob.teaching_tip}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* [채점 모드]: 아이 답 비교 + 근거 풀이 + 오개념 + 스크립트 + 쌍둥이 문제 */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <span className="text-xs text-slate-400 block mb-0.5">아이의 답</span>
                            <span className="font-bold text-slate-700">{prob.student_answer}</span>
                          </div>
                          <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                            <span className="text-xs text-indigo-400 block mb-0.5">실제 정답</span>
                            <span className="font-bold text-indigo-700">{prob.correct_answer}</span>
                          </div>
                        </div>

                        {prob.solution_steps && prob.solution_steps.length > 0 && (
                          <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100/80 text-xs">
                            <span className="font-bold text-indigo-950 block mb-2 flex items-center gap-1.5">
                              <span>💡</span> 정답 도출 과정 (왜 이 답이 나올까요?)
                            </span>
                            <ul className="space-y-1.5 text-slate-700">
                              {prob.solution_steps.map((step, sIdx) => (
                                <li key={sIdx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-indigo-600 font-bold shrink-0">•</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-xs space-y-1">
                          <span className="font-bold text-slate-600 block">오개념 및 취약점 분석</span>
                          <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                            {prob.error_analysis}
                          </p>
                        </div>

                        {!prob.is_correct && prob.parent_script && (
                          <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200">
                            <h4 className="text-xs font-bold text-amber-900 mb-2.5 flex items-center gap-1.5">
                              <span>💬</span> 아이에게 이렇게 코칭해 보세요
                            </h4>
                            <div className="space-y-2 text-xs text-amber-950">
                              {prob.parent_script.map((step, sIdx) => (
                                <div key={sIdx} className="flex gap-2 items-start">
                                  <span className="bg-amber-200 text-amber-900 font-bold w-4 h-4 flex items-center justify-center rounded-full shrink-0 text-[10px] mt-0.5">
                                    {sIdx + 1}
                                  </span>
                                  <p className="leading-relaxed">{step}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {prob.twin_problem && (
                          <div className="border-t border-slate-100 pt-3">
                            <span className="text-xs font-bold text-slate-700 block mb-1.5">
                              📝 쌍둥이 확인 문제
                            </span>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
                              {prob.twin_problem.question}
                            </div>
                            <details className="mt-2 text-xs text-slate-400 cursor-pointer group">
                              <summary className="group-hover:text-indigo-600 font-medium select-none">
                                쌍둥이 문제 정답 및 풀이 확인
                              </summary>
                              <div className="mt-2 p-3 bg-slate-100 rounded-lg text-slate-700 text-xs leading-relaxed">
                                {prob.twin_problem.answer}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <span className="text-4xl mb-3">
                  {activeMode === "guide" ? "📖" : "📚"}
                </span>
                <p className="text-sm font-semibold text-slate-600">
                  {activeMode === "guide"
                    ? "사전 지도할 문제집 사진을 올려주세요"
                    : "아직 업로드된 문제가 없습니다"}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {activeMode === "guide"
                    ? "아직 풀지 않은 깨끗한 문제집을 찍으면, 아이에게 알려줄 핵심 원리와 정석 풀이법을 빠르게 정리해 드립니다."
                    : "왼쪽에서 문제집 사진을 올리고 버튼을 누르면 문항별 채점 결과, 수식 풀이 근거, 부모용 코칭 가이드가 표시됩니다."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}