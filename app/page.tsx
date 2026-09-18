// app/page.tsx
"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import MathText from "@/components/MathText";
import ImageCropperModal from "@/components/ImageCropperModal";
import { shareOrDownloadElement } from "@/utils/exportImage";

interface ProblemItem {
  problem_number: string;
  problem_text: string;
  correct_answer: string;
  solution_steps: string[];
  concept: string;
  student_answer?: string;
  is_correct?: boolean;
  error_analysis?: string;
  parent_script?: string[];
  twin_problem?: {
    question: string;
    answer: string;
  };
  teaching_tip?: string;
}

interface AnalysisResponse {
  mode?: "grade" | "guide";
  problems: ProblemItem[];
  modelUsed?: string;
}

// 히스토리 항목 인터페이스
interface HistoryRecord {
  id: string;
  timestamp: number;
  mode: "grade" | "guide";
  problems: ProblemItem[];
  summaryTitle: string;
}

type TabType = "camera" | "result" | "history";

const GRADE_LOADING_STEPS = [
  "문제집 이미지와 손글씨 풀이를 스캔하고 있습니다...",
  "초·중등 교육과정 단원을 분류하고 있습니다...",
  "정답 도출 수식과 아이 풀이를 정밀 대조하고 있습니다...",
  "AI 모델 최적 경로 탐색 및 코칭 가이드 생성 중...",
  "학부모용 코칭 대화 가이드와 쌍둥이 문제를 생성하고 있습니다...",
];

const GUIDE_LOADING_STEPS = [
  "깨끗한 문제집 이미지를 스캔하고 있습니다...",
  "단원별 핵심 공식과 개념 원리를 정리하고 있습니다...",
  "단계별 정석 풀이법을 도출하고 있습니다...",
  "AI 모델 최적 경로 탐색 및 지도 팁 정리 중...",
  "아이가 자주 빠지는 함정과 부모 지도 팁을 정리하고 있습니다...",
];

const STORAGE_KEY = "math_coach_history_v1";

async function compressImage(file: File): Promise<Blob> {
  const SAFE_LIMIT = 4.0 * 1024 * 1024;

  if (file.name === "cropped.jpg" && file.size <= SAFE_LIMIT) {
    return file;
  }

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

      const MAX_WIDTH = 2048;
      const MAX_HEIGHT = 2048;
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

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => reject(file);
  });
}

export default function MathCoachPage() {
  const [activeTab, setActiveTab] = useState<TabType>("camera");
  const [activeMode, setActiveMode] = useState<"grade" | "guide">("grade");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [results, setResults] = useState<ProblemItem[] | null>(null);
  const [resultMode, setResultMode] = useState<"grade" | "guide">("grade");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportingIdx, setExportingIdx] = useState<number | "all" | null>(null);

  // 최근 기록(히스토리) 상태
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);

  // 스크롤 감지 및 하단 탭 숨김 제어
  const [showBottomNav, setShowBottomNav] = useState(true);
  const lastScrollY = useRef(0);

  const reportContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const currentLoadingSteps =
    activeMode === "guide" ? GUIDE_LOADING_STEPS : GRADE_LOADING_STEPS;

  // 로컬 스토리지에서 기록 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistoryList(JSON.parse(saved));
      }
    } catch (e) {
      console.error("히스토리 로드 실패:", e);
    }
  }, []);

  // 로딩 단계 텍스트 롤링
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setStepIdx(0);
      interval = setInterval(() => {
        setStepIdx((prev) => (prev + 1) % currentLoadingSteps.length);
      }, 1600);
    }
    return () => clearInterval(interval);
  }, [loading, currentLoadingSteps.length]);

  // 스크롤 이벤트 (PC 데스크톱 제외)
  useEffect(() => {
    const handleScroll = () => {
      // 진짜 PC 데스크톱인 경우: 폭 768px 이상이면서 세로 높이도 600px 이상일 때
      const isDesktop = window.innerWidth >= 768 && window.innerHeight >= 600;
      if (isDesktop) {
        setShowBottomNav(true);
        return;
      }

      const currentScrollY = window.scrollY;

      // 최상단 근처일 때는 항상 노출
      if (currentScrollY < 20) {
        setShowBottomNav(true);
        lastScrollY.current = currentScrollY;
        return;
      }

      // 스크롤 방향 감지 (모바일 세로 및 모바일 가로 모두 동작)
      if (Math.abs(currentScrollY - lastScrollY.current) > 10) {
        if (currentScrollY > lastScrollY.current) {
          setShowBottomNav(false); // 아래로 스크롤 시 숨김
        } else {
          setShowBottomNav(true);  // 위로 스크롤 시 표시
        }
        lastScrollY.current = currentScrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 새 분석 결과 로컬 히스토리에 저장
  const saveToHistory = (mode: "grade" | "guide", problems: ProblemItem[]) => {
    if (!problems || problems.length === 0) return;

    const firstProb = problems[0];
    const summaryTitle =
      firstProb.concept ||
      (firstProb.problem_text
        ? firstProb.problem_text.slice(0, 30) + "..."
        : `${problems.length}개 문항 분석`);

    const newRecord: HistoryRecord = {
      id: "rec_" + Date.now(),
      timestamp: Date.now(),
      mode,
      problems,
      summaryTitle,
    };

    setHistoryList((prev) => {
      const updated = [newRecord, ...prev].slice(0, 30); // 최근 30개 유지
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("히스토리 저장 실패:", e);
      }
      return updated;
    });
  };

  // 특정 히스토리 항목 불러오기
  const handleLoadHistoryItem = (item: HistoryRecord) => {
    setResults(item.problems);
    setResultMode(item.mode);
    setActiveTab("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 특정 히스토리 삭제
  const handleDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("이 분석 기록을 삭제하시겠습니까?")) return;

    setHistoryList((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // 전체 히스토리 삭제
  const handleClearAllHistory = () => {
    if (!confirm("모든 분석 기록을 삭제하시겠습니까?")) return;
    setHistoryList([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        setRawImageSrc(base64Data);
        setPreview(base64Data);
        setFile(selectedFile);
        setIsCropperOpen(true);
      };
      reader.readAsDataURL(selectedFile);

      setResults(null);
      setErrorMsg(null);
    }
  };

  const handleCropComplete = (croppedBlob: Blob, croppedUrl: string) => {
    const croppedFile = new File([croppedBlob], "cropped.jpg", {
      type: "image/jpeg",
    });
    setFile(croppedFile);
    setPreview(croppedUrl);
    setIsCropperOpen(false);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setActiveTab("result");

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
        throw new Error(
          errorData.error ||
            "일시적으로 AI 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요."
        );
      }

      const data: AnalysisResponse = await res.json();
      const parsedProblems = data.problems || [];
      const appliedMode = data.mode || activeMode;

      setResults(parsedProblems);
      setResultMode(appliedMode);

      // 분석 성공 시 히스토리에 자동 추가
      saveToHistory(appliedMode, parsedProblems);
    } catch (err: any) {
      console.error("전송 에러:", err);
      setErrorMsg(
        err.message || "분석 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm("로그아웃하고 화면을 잠그시겠습니까?")) {
      localStorage.removeItem("math_coach_auth");
      window.location.reload();
    }
  };

  const handleShareCard = async (index: number) => {
    const cardEl = cardRefs.current[index];
    if (!cardEl) return;

    try {
      setExportingIdx(index);
      const prob = results?.[index];
      const probNum = prob?.problem_number || `${index + 1}번`;
      await shareOrDownloadElement(
        cardEl,
        `수학코치_${probNum}_리포트`,
        `[수학 홈코치] ${probNum} 분석 리포트`
      );
    } catch (e) {
      alert("이미지 저장/공유 중 오류가 발생했습니다.");
    } finally {
      setExportingIdx(null);
    }
  };

  const handleShareAll = async () => {
    if (!reportContainerRef.current) return;

    try {
      setExportingIdx("all");
      await shareOrDownloadElement(
        reportContainerRef.current,
        `수학코치_전체분석결과`,
        `[수학 홈코치] 전체 문항 채점 & 코칭 리포트`
      );
    } catch (e) {
      alert("전체 리포트 저장/공유 중 오류가 발생했습니다.");
    } finally {
      setExportingIdx(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 antialiased font-sans transition-colors ios-safe-content-pb">
      {/* 1. 상단 네비게이션 헤더 */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors mobile-landscape-header">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📐</span>
            <span className="text-lg sm:text-xl font-extrabold text-indigo-700 dark:text-indigo-400 tracking-tight">
              초·중등 수학 홈코치 AI
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 hidden sm:inline-block">
              수학 채점 & 학부모 지도 코칭
            </span>

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              title="로그아웃 (화면 잠금)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700"
            >
              <span>🔒</span>
              <span className="hidden sm:inline">잠금</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. 메인 컨텐츠 영역 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* ==========================================
            TAB 1: [문제 촬영]
        ========================================== */}
        {activeTab === "camera" && (
          <div className="space-y-4 max-w-xl mx-auto animate-fadeIn">
            <div className="bg-slate-200/80 dark:bg-slate-800 p-1.5 rounded-2xl flex gap-1 shadow-inner transition-colors">
              <button
                type="button"
                onClick={() => {
                  setActiveMode("grade");
                  setResults(null);
                }}
                disabled={loading}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === "grade"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === "guide"
                    ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>📖</span>
                <span>사전 지도 가이드</span>
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
              <div className="mb-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {activeMode === "grade"
                    ? "풀이 완료된 문제집 촬영"
                    : "아직 풀지 않은 문제집 촬영"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {activeMode === "grade"
                    ? "아이의 손글씨 풀이를 스캔해 정오답과 오개념을 짚어줍니다."
                    : "부모님이 먼저 훑어볼 수 있도록 핵심 원리와 정석 풀이를 요약합니다."}
                </p>
              </div>

              {preview ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-3">
                    <img
                      src={preview}
                      alt="선택된 문제"
                      className={`max-h-80 w-full object-contain rounded-xl transition-opacity ${
                        loading ? "opacity-50" : "opacity-100"
                      }`}
                    />
                  </div>

                  {!loading && (
                    <div className="flex items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsCropperOpen(true)}
                        className="flex-1 py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-1.5 border border-indigo-200/60 dark:border-indigo-800/60"
                      >
                        <span>✂️</span>
                        <span>영역 다시 자르기</span>
                      </button>

                      <label
                        htmlFor="camera-input"
                        className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                      >
                        <span>🔄</span>
                        <span>다른 사진 촬영</span>
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <label
                  htmlFor="camera-input"
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 transition-all text-center group ${
                    loading
                      ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 cursor-not-allowed"
                      : "border-indigo-200 dark:border-indigo-900/60 cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 hover:border-indigo-400 dark:hover:border-indigo-600"
                  }`}
                >
                  <div className="py-8">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-105 transition-transform border border-indigo-100/50 dark:border-indigo-900/50">
                      📷
                    </div>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                      문제집 사진 촬영 또는 선택
                    </p>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1.5">
                      {activeMode === "grade"
                        ? "손글씨가 선명하게 나오도록 촬영해 주세요"
                        : "문제 내용이 전체적으로 보이도록 촬영해 주세요"}
                    </p>
                  </div>
                </label>
              )}

              <input
                id="camera-input"
                type="file"
                accept="image/*"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
              />

              <button
                onClick={handleAnalyze}
                disabled={!file || loading}
                className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-bold py-4 rounded-2xl transition-all shadow-md flex justify-center items-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>분석 화면으로 이동 중...</span>
                  </div>
                ) : activeMode === "guide" ? (
                  "부모용 사전 지도 가이드 받기"
                ) : (
                  "전체 문항 채점 & 오답 코칭 보기"
                )}
              </button>

              {errorMsg && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs rounded-xl border border-red-100 dark:border-red-900/50 text-center space-y-1">
                  <p className="font-bold">⚠️ 안내</p>
                  <p>{errorMsg}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            TAB 2: [분석 결과 리포트]
        ========================================== */}
        {activeTab === "result" && (
          <div className="space-y-6 max-w-2xl mx-auto animate-fadeIn">
            {loading ? (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-sm space-y-6 transition-colors text-center">
                <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-100 dark:border-indigo-950 border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
                  <span className="text-3xl animate-pulse">
                    {activeMode === "guide" ? "📖" : "🤖"}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {activeMode === "guide"
                    ? "문제 원리와 지도 팁을 정리하고 있습니다"
                    : "손글씨와 문제를 정밀 분석하고 있습니다"}
                </h3>

                <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 font-medium mt-2 min-h-[1.5rem] transition-all">
                  {currentLoadingSteps[stepIdx]}
                </p>
              </div>
            ) : results && results.length > 0 ? (
              <div className="space-y-6" ref={reportContainerRef}>
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>
                        {resultMode === "guide"
                          ? "📖 사전 지도 가이드"
                          : "✏️ 채점 & 코칭 리포트"}
                      </span>
                      <span className="text-indigo-600 dark:text-indigo-400 text-sm font-normal">
                        ({results.length}개 문항)
                      </span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {resultMode === "grade" && (
                      <div className="flex gap-1.5">
                        <span className="text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg font-semibold border border-green-200 dark:border-green-800/60">
                          정답 {results.filter((p) => p.is_correct).length}
                        </span>
                        <span className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2.5 py-1 rounded-lg font-semibold border border-red-200 dark:border-red-800/60">
                          오답 {results.filter((p) => !p.is_correct).length}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleShareAll}
                      disabled={exportingIdx !== null}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all border border-indigo-200/80 dark:border-indigo-800/60 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span>{exportingIdx === "all" ? "⏳" : "📤"}</span>
                      <span>{exportingIdx === "all" ? "저장 중..." : "전체 공유"}</span>
                    </button>
                  </div>
                </div>

                {results.map((prob, idx) => (
                  <article
                    key={idx}
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    {/* 가로 찌그러짐을 수정한 2행 구조 헤더 */}
                    <div className="space-y-2.5 pb-1 border-b border-slate-100 dark:border-slate-800/60">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-extrabold text-slate-900 dark:text-white shrink-0">
                            {prob.problem_number || `${idx + 1}번`}
                          </span>
                          {resultMode === "grade" && (
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${
                                prob.is_correct
                                  ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200/60 dark:border-green-800/40"
                                  : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-800/40"
                              }`}
                            >
                              {prob.is_correct ? "정답" : "오답 코칭 필요"}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleShareCard(idx)}
                          disabled={exportingIdx !== null}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 border border-slate-200/80 dark:border-slate-700 cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
                        >
                          <span>{exportingIdx === idx ? "⏳" : "📤"}</span>
                          <span>{exportingIdx === idx ? "저장 중..." : "공유/저장"}</span>
                        </button>
                      </div>

                      {prob.concept && (
                        <div className="flex flex-wrap items-center">
                          <span className="text-xs bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 px-2.5 py-1 rounded-lg font-medium leading-relaxed">
                            {prob.concept}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-sans font-medium">
                      <MathText content={prob.problem_text} />
                    </div>

                    {resultMode === "guide" ? (
                      <div className="space-y-3">
                        <div className="bg-indigo-50/60 dark:bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
                          <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                            이 문제의 정답
                          </span>
                          <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">
                            <MathText content={prob.correct_answer} />
                          </span>
                        </div>

                        {prob.solution_steps && prob.solution_steps.length > 0 && (
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 text-sm">
                            <span className="font-bold text-slate-800 dark:text-slate-200 block mb-2">
                              📌 단계별 정석 풀이법
                            </span>
                            <ul className="space-y-2 text-slate-700 dark:text-slate-300">
                              {prob.solution_steps.map((step, sIdx) => (
                                <li key={sIdx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                                  <span className="flex-1">
                                    <MathText content={step} />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {prob.teaching_tip && (
                          <div className="bg-amber-50/80 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 text-sm">
                            <span className="font-bold text-amber-950 dark:text-amber-200 block mb-1.5 flex items-center gap-1.5">
                              <span>💡</span> 아이 지도 시 함정 포인트 & 팁
                            </span>
                            <div className="text-amber-900 dark:text-amber-300 leading-relaxed font-medium">
                              <MathText content={prob.teaching_tip} />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <span className="text-xs text-slate-400 dark:text-slate-500 block mb-0.5">아이의 답</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200 text-base">
                              <MathText content={prob.student_answer || ""} />
                            </span>
                          </div>
                          <div className="bg-indigo-50/50 dark:bg-indigo-950/40 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                            <span className="text-xs text-indigo-400 dark:text-indigo-300 block mb-0.5">실제 정답</span>
                            <span className="font-bold text-indigo-700 dark:text-indigo-300 text-base">
                              <MathText content={prob.correct_answer} />
                            </span>
                          </div>
                        </div>

                        {prob.solution_steps && prob.solution_steps.length > 0 && (
                          <div className="bg-indigo-50/40 dark:bg-indigo-950/30 p-4 rounded-2xl border border-indigo-100/80 dark:border-indigo-900/40 text-sm">
                            <span className="font-bold text-indigo-950 dark:text-indigo-200 block mb-2 flex items-center gap-1.5">
                              <span>💡</span> 정답 도출 과정
                            </span>
                            <ul className="space-y-2 text-slate-700 dark:text-slate-300">
                              {prob.solution_steps.map((step, sIdx) => (
                                <li key={sIdx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                                  <span className="flex-1">
                                    <MathText content={step} />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {prob.error_analysis && (
                          <div className="text-sm space-y-1">
                            <span className="font-bold text-slate-600 dark:text-slate-400 block text-xs">오개념 및 취약점 분석</span>
                            <div className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                              <MathText content={prob.error_analysis} />
                            </div>
                          </div>
                        )}

                        {!prob.is_correct && prob.parent_script && (
                          <div className="bg-amber-50/80 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50">
                            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 mb-2.5 flex items-center gap-1.5">
                              <span>💬</span> 아이에게 이렇게 코칭해 보세요
                            </h4>
                            <div className="space-y-2 text-sm text-amber-950 dark:text-amber-300">
                              {prob.parent_script.map((step, sIdx) => (
                                <div key={sIdx} className="flex gap-2.5 items-start">
                                  <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold w-5 h-5 flex items-center justify-center rounded-full shrink-0 text-xs mt-0.5">
                                    {sIdx + 1}
                                  </span>
                                  <div className="leading-relaxed flex-1">
                                    <MathText content={step} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {prob.twin_problem && (
                          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                              📝 쌍둥이 확인 문제
                            </span>
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                              <MathText content={prob.twin_problem.question} />
                            </div>
                            <details className="mt-2 text-xs text-slate-400 dark:text-slate-500 cursor-pointer group">
                              <summary className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 font-medium select-none">
                                쌍둥이 문제 정답 및 풀이 확인
                              </summary>
                              <div className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                                <MathText content={prob.twin_problem.answer} />
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
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/30">
                <span className="text-5xl mb-4">📊</span>
                <p className="text-base font-bold text-slate-700 dark:text-slate-200">
                  아직 분석된 리포트가 없습니다
                </p>
                <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-2 max-w-xs leading-relaxed">
                  하단의 <strong>[📷 문제 촬영]</strong> 탭에서 문제집 사진을 업로드하고 분석을 시작해 보세요.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("camera")}
                  className="mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  문제 촬영하러 가기
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB 3: [최근 기록 (히스토리)] 뷰
        ========================================== */}
        {activeTab === "history" && (
          <div className="max-w-xl mx-auto space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🕒</span>
                  <span>최근 코칭 기록</span>
                  <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                    {historyList.length}개
                  </span>
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  최근 분석한 최대 30개의 코칭 리포트를 보관합니다.
                </p>
              </div>

              {historyList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  className="text-xs font-semibold text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                >
                  전체 삭제
                </button>
              )}
            </div>

            {historyList.length > 0 ? (
              <div className="space-y-3">
                {historyList.map((item) => {
                  const correctCount = item.problems.filter((p) => p.is_correct).length;
                  const totalCount = item.problems.length;
                  const dateStr = new Date(item.timestamp).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleLoadHistoryItem(item)}
                      className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 shadow-sm transition-all cursor-pointer group flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              item.mode === "guide"
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                : "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                            }`}
                          >
                            {item.mode === "guide" ? "사전 지도" : "채점 코칭"}
                          </span>

                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {dateStr}
                          </span>

                          {item.mode === "grade" && (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              (정답 {correctCount}/{totalCount})
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.summaryTitle}
                        </p>

                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          총 {item.problems.length}개 문제 리포트 보관 중
                        </p>
                      </div>

                      {/* 삭제 버튼 */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        title="기록 삭제"
                        className="p-2 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <span className="text-4xl">🕒</span>
                <h4 className="text-base font-bold text-slate-700 dark:text-slate-200">
                  저장된 분석 기록이 없습니다
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                  문제집을 촬영하고 분석을 완료하면 이곳에 자동으로 차곡차곡 기록됩니다.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. 모바일 하단 탭 바 */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out ios-safe-bottom md:!translate-y-0 ${
          showBottomNav ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-md mx-auto grid grid-cols-3 h-16 landscape:h-12 md:h-16 items-center px-4">
          <button
            type="button"
            onClick={() => setActiveTab("camera")}
            className={`flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === "camera"
                ? "text-indigo-600 dark:text-indigo-400 scale-105"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <span className="text-xl sm:text-2xl landscape:text-lg">📷</span>
            <span className="text-[11px] landscape:text-[10px] font-bold mt-0.5">문제 촬영</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("result")}
            className={`relative flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === "result"
                ? "text-indigo-600 dark:text-indigo-400 scale-105"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <span className="text-xl sm:text-2xl landscape:text-lg">📊</span>
            <span className="text-[11px] landscape:text-[10px] font-bold mt-0.5">분석 결과</span>
            {results && results.length > 0 && (
              <span className="absolute top-2 right-6 landscape:top-1 landscape:right-8 w-4 h-4 bg-indigo-600 text-white text-[9px] font-extrabold flex items-center justify-center rounded-full">
                {results.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`relative flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === "history"
                ? "text-indigo-600 dark:text-indigo-400 scale-105"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <span className="text-xl sm:text-2xl landscape:text-lg">🕒</span>
            <span className="text-[11px] landscape:text-[10px] font-bold mt-0.5">최근 기록</span>
            {historyList.length > 0 && (
              <span className="absolute top-2 right-6 landscape:top-1 landscape:right-8 w-2 h-2 bg-indigo-500 rounded-full" />
            )}
          </button>
        </div>
      </nav>

      {/* 4. 이미지 자르기 모달 */}
      {isCropperOpen && rawImageSrc && (
        <div className="relative z-[9999]">
          <ImageCropperModal
            imageSrc={rawImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={() => setIsCropperOpen(false)}
          />
        </div>
      )}
    </div>
  );
}