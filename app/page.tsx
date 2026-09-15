"use client";

import { useState, useEffect, ChangeEvent } from "react";

interface ProblemItem {
  problem_number: string;
  problem_text: string;
  correct_answer: string;
  solution_steps: string[];
  student_answer: string;
  is_correct: boolean;
  concept: string;
  error_analysis: string;
  parent_script: string[];
  twin_problem: {
    question: string;
    answer: string;
  };
}

interface AnalysisResponse {
  problems: ProblemItem[];
}

const LOADING_STEPS = [
  "문제집 이미지와 손글씨 풀이를 스캔하고 있습니다...",
  "초·중등 교육과정 단원(소인수분해, 분수 연산 등)을 분류하고 있습니다...",
  "정답 도출 수식과 아이의 풀이 과정을 정밀 대조하고 있습니다...",
  "학부모용 맞춤 설명 가이드와 쌍둥이 문제를 생성하고 있습니다...",
];

// 스마트폰 카메라 원본 이미지 압축 함수 (10MB+ -> 1MB 이하)
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

      const MAX_WIDTH = 1600;
      const MAX_HEIGHT = 1600;
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
        0.8
      );
    };
    img.onerror = () => reject(file);
  });
}

export default function MathCoachPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [results, setResults] = useState<ProblemItem[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setStepIdx(0);
      interval = setInterval(() => {
        setStepIdx((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [loading]);

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
          {/* 수정: 단원 나열 대신 포괄적인 문구 적용 */}
          <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
            초·중등 전 학년 수학 채점 & 학부모 지도 코칭 리포트
          </span>
        </div>
      </header>
      
      {/* 중앙 레이아웃 컨테이너 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* 좌측: 사진 업로드 박스 */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold text-slate-900 mb-1">
                수학 문제집 사진 업로드
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                손글씨 풀이가 포함된 문제집 한 면을 촬영해 올려주세요.
              </p>

              <label
                htmlFor="camera-input"
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-all text-center group ${
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
                      className={`max-h-80 w-full object-contain rounded-lg shadow-sm transition-opacity ${
                        loading ? "opacity-50" : "opacity-100"
                      }`}
                    />
                    {!loading && (
                      <span className="text-xs text-indigo-600 font-semibold inline-block group-hover:underline">
                        사진 다시 선택하기
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="py-6">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 group-hover:scale-105 transition-transform">
                      📷
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      클릭하여 사진 촬영 또는 파일 업로드
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      모바일 카메라 및 갤러리 지원
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
                    <span>정밀 채점 및 분석 중...</span>
                  </div>
                ) : (
                  "전체 문항 채점 & 가이드 보기"
                )}
              </button>

              {errorMsg && (
                <div className="mt-3 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 text-center">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 분석 결과 목록 */}
          <div className="lg:col-span-7">
            {loading ? (
              <div className="bg-white p-8 rounded-2xl border border-indigo-100 shadow-sm space-y-6">
                <div className="flex flex-col items-center justify-center text-center py-6">
                  <div className="relative flex items-center justify-center w-20 h-20 mb-5">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                    <span className="text-3xl animate-pulse">🤖</span>
                  </div>

                  <h3 className="text-base font-bold text-slate-800">
                    AI가 수학 문제를 정밀 분석하고 있습니다
                  </h3>
                  
                  <p className="text-xs text-indigo-600 font-medium mt-2 transition-all duration-300 min-h-[1.25rem]">
                    {LOADING_STEPS[stepIdx]}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  {[1, 2].map((i) => (
                    <div key={i} className="p-5 border border-slate-100 rounded-xl space-y-3 animate-pulse bg-slate-50/60">
                      <div className="flex justify-between items-center">
                        <div className="h-4 bg-slate-200 rounded w-20" />
                        <div className="h-5 bg-slate-200 rounded-full w-14" />
                      </div>
                      <div className="h-10 bg-slate-200/70 rounded-lg w-full" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-12 bg-slate-200/50 rounded-lg" />
                        <div className="h-12 bg-slate-200/50 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : results ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900">
                    분석 리포트 <span className="text-indigo-600 font-normal">({results.length}개 문항)</span>
                  </h3>
                  <div className="flex gap-2">
                    <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-md font-semibold border border-green-200">
                      정답 {results.filter((p) => p.is_correct).length}
                    </span>
                    <span className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-md font-semibold border border-red-200">
                      오답 {results.filter((p) => !p.is_correct).length}
                    </span>
                  </div>
                </div>

                {results.map((prob, idx) => (
                  <article
                    key={idx}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:border-slate-300 transition-colors"
                  >
                    {/* 상단 문항 정보 및 정오답 뱃지 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {prob.problem_number || `${idx + 1}번 문제`}
                        </span>
                        <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">
                          {prob.concept}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          prob.is_correct
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {prob.is_correct ? "정답" : "오답 코칭 필요"}
                      </span>
                    </div>

                    {/* 문제 요약 */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed font-mono">
                      {prob.problem_text}
                    </div>

                    {/* 아이 풀이 vs 실제 정답 */}
                    <div className="space-y-2.5">
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

                      {/* 정답 도출 과정 (왜 정답인지 단계별 수식/근거 설명) */}
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
                    </div>

                    {/* 오개념 및 풀이 분석 */}
                    <div className="text-xs space-y-1">
                      <span className="font-bold text-slate-600 block">오개념 및 취약점 분석</span>
                      <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                        {prob.error_analysis}
                      </p>
                    </div>

                    {/* 학부모 코칭 대화 가이드 */}
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

                    {/* 쌍둥이 확인 문제 */}
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
                  </article>
                ))}
              </div>
            ) : (
              <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <span className="text-4xl mb-3">📚</span>
                <p className="text-sm font-semibold text-slate-600">
                  아직 업로드된 문제가 없습니다
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  왼쪽에서 문제집 사진을 올리고 버튼을 누르면 문항별 채점 결과, 수식 풀이 근거, 부모용 코칭 가이드가 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}