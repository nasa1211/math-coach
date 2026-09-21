// components/MathText.tsx
"use client";

import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  content: string;
  className?: string;
}

/**
 * AI 응답에서 훼손되거나 역슬래시/중괄호가 누락된 LaTeX 수식을 정밀 복구하고,
 * 한 줄로 뭉쳐진 보기 기호(①~⑩) 앞에 자동으로 줄바꿈을 삽입하는 함수
 */
function fixMathExpression(str: string): string {
  if (!str) return "";

  let res = str;

  // 1. 유실된 제어 문자(Form Feed \x0C 등) 제거
  res = res.replace(/[\x0C]/g, "");

  // 2. 한 줄로 뭉쳐진 보기 번호(①~⑩) 및 단계 구분어 앞에 자동 줄바꿈(\n) 강제 삽입
  res = res.replace(/([^\n])\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, "$1\n$2");
  res = res.replace(/([^\n])\s*(\d+단계:)/g, "$1\n$2");

  // 3. 역슬래시가 빠진 LaTeX 키워드 강제 복구 (frac, times, div, pm 등)
  res = res.replace(/(?<!\\)\b(frac|times|div|pm|neq|sqrt|pi|left|right)\b/g, "\\$1");

  // 4. 중괄호 없이 숫자가 뭉친 분수 구문 완벽 복구
  res = res.replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}");
  res = res.replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
  res = res.replace(/\\frac\s*([a-zA-Z])\s*([a-zA-Z])/g, "\\frac{$1}{$2}");

  // 5. [방어 로직] $...$ 로 감싸이지 않은 수식 덩어리를 자동 포착하여 $...$ 로 감싸기
  // (예: y = -\frac{3}{4}x 또는 \times (-4) 처럼 역슬래시 수식이 $ 밖에 노출된 경우)
  res = res.replace(
    /(?<!\$)(?:\b[a-zA-Z]\s*=\s*)?(-?\\frac\{[^}]+\}\{[^}]+\}[a-zA-Z0-9_*\/+-]*|\\times\s*(?:\([^)]+\)|[0-9a-zA-Z]+))(?!\$)/g,
    "$$&$"
  );

  // 6. 홀로 존재하는 $ 제거 및 연속된 $$ 수식 분리 방지 (짝 맞춤 예외 처리)
  // 단독 닫는 $ 등 오염 데이터 교정
  res = res.replace(/([^$])\$(?![$\s\n0-9a-zA-Z\\{}(),.+-=])/g, "$1");

  return res;
}

/**
 * KaTeX 수식 문자열 내부의 미세 오류를 최종 보정하는 함수
 */
function cleanLatexForKatex(mathStr: string): string {
  return mathStr
    .replace(/(?<!\\)\b(frac|times|div|pm|neq)\b/g, "\\$1")
    .replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
}

export default function MathText({ content, className = "" }: MathTextProps) {
  if (!content) return null;

  // 수식 복구 및 자동 줄바꿈 전처리 수행
  const fixedContent = fixMathExpression(content);
  const lines = fixedContent.split("\n");

  return (
    <span className={`block w-full space-y-1.5 text-left ${className}`}>
      {lines.map((line, lineIndex) => {
        if (!line.trim()) return null;

        // $$...$$ (블록 수식) 또는 $...$ (인라인 수식) 단위 분할
        const parts = line.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

        return (
          <span key={lineIndex} className="block leading-relaxed">
            {parts.map((part, index) => {
              // 1. 디스플레이 수식 ($$...$$)
              if (part.startsWith("$$") && part.endsWith("$$")) {
                const math = cleanLatexForKatex(part.slice(2, -2).trim());
                try {
                  const html = katex.renderToString(math, {
                    displayMode: true,
                    throwOnError: false,
                  });
                  return (
                    <span
                      key={index}
                      className="block my-2 text-center overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                } catch {
                  return <span key={index}>{part}</span>;
                }
              }

              // 2. 인라인 수식 ($...$)
              if (part.startsWith("$") && part.endsWith("$")) {
                const math = cleanLatexForKatex(part.slice(1, -1).trim());
                try {
                  const html = katex.renderToString(math, {
                    displayMode: false,
                    throwOnError: false,
                  });
                  return (
                    <span
                      key={index}
                      className="inline mx-0.5 align-middle"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                } catch {
                  return <span key={index}>{part}</span>;
                }
              }

              // 3. 일반 텍스트
              return <span key={index}>{part}</span>;
            })}
          </span>
        );
      })}
    </span>
  );
}