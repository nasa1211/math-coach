// components/AuthGuard.tsx
"use client";

import { useState, useEffect, ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [inputCode, setInputCode] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const CORRECT_PASSCODE = process.env.NEXT_PUBLIC_ACCESS_PASSCODE || "2026math";

  useEffect(() => {
    // 최초 접속 시 로컬스토리지 인증 여부 확인
    const authStatus = localStorage.getItem("math_coach_auth");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim() === CORRECT_PASSCODE) {
      localStorage.setItem("math_coach_auth", "true");
      setIsAuthenticated(true);
      setErrorMsg("");
    } else {
      setErrorMsg("접근 암호가 올바르지 않습니다.");
      setInputCode("");
    }
  };

  // 로컬스토리지 로딩 중일 때 깜빡임 방지
  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  // 인증 전: 로그인/암호 입력 화면 표시
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full p-8 rounded-3xl shadow-lg border border-slate-200 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-sm">
            📐
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              초·중등 수학 홈코치
            </h1>
            <p className="text-xs text-slate-500 mt-1">
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
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm font-semibold tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {errorMsg && (
                <p className="text-xs text-red-500 font-medium mt-2">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-100 cursor-pointer text-sm"
            >
              입장하기
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            암호는 최초 1회만 입력하시면 계속 유지됩니다.
          </p>
        </div>
      </div>
    );
  }

  // 인증 완료: 실제 메인 앱 표시
  return <>{children}</>;
}