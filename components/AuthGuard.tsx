"use client";

import { useState, useEffect, ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [inputCode, setInputCode] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => {
        if (!cancelled) setIsAuthenticated(data.ok === true);
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inputCode.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || "접근 암호가 올바르지 않습니다.");
        setInputCode("");
        return;
      }
      localStorage.removeItem("math_coach_auth");
      setIsAuthenticated(true);
    } catch {
      setErrorMsg("로그인 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
        <div className="bg-white dark:bg-slate-900 max-w-sm w-full p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-6 transition-colors">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-sm border border-indigo-100 dark:border-indigo-900/50">
            📐
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              초·중등 수학 홈코치
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              초대된 사용자 전용 서비스입니다.<br />발급받은 접근 암호를 입력해 주세요.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="접근 암호 입력"
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-sm font-semibold tracking-widest text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:bg-white dark:focus:bg-slate-800 transition-all"
              />
              {errorMsg && (
                <p className="text-xs text-red-500 dark:text-red-400 font-medium mt-2">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none cursor-pointer text-sm"
            >
              입장하기
            </button>
          </form>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            암호는 최초 1회만 입력하시면 계속 유지됩니다.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}