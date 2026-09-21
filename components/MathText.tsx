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
 * AI 응답에서 훼손되거나 역슬래시/중괄호가 누락된 LaTeX 수식을 정밀 복구하는 함수
 */
function fixMathExpression(str: string): string {
  if (!str) return "";

  let res = str;

  // 1. 유실된 제어 문자(Form Feed \x0C 등) 제거
  res = res.replace(/[\x0C]/g, "");

  // 2. 역슬래시가 빠진 LaTeX 키워드 강제 복구 (frac, times, div, pm, neq, sqrt, pi, left, right)
  res = res.replace(/(?<!\\)\b(frac|times|div|pm|neq|sqrt|pi|left|right)\b/g, "\\$1");

  // 3. 중괄호 없이 숫자가 뭉친 분수 구문 완벽 복구
  // 예: \frac1825 -> \frac{18}{25}
  res = res.replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}");
  // 예: \frac35 -> \frac{3}{5}, -\frac65 -> -\frac{6}{5}
  res = res.replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
  // 예: \fracxy -> \frac{x}{y}
  res = res.replace(/\\frac\s*([a-zA-Z])\s*([a-zA-Z])/g, "\\frac{$1}{$2}");

  // 4. $ 구분자 밖에 수식 키워드가 튀어나온 경우 ($...$ 범위 외 수식 자동 감싸기)
  const parts = res.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);
  res = parts
    .map((part) => {
      if (
        (part.startsWith("$") && part.endsWith("$")) ||
        (part.startsWith("$$") && part.endsWith("$$"))
      ) {
        return part;
      }
      // $ 밖에 명확한 수식 기호가 존재하는 경우 $...$ 로 감싸기
      return part.replace(
        /(\\frac\{[^}]+\}\{[^}]+\}[a-zA-Z0-9_]*|\\times|\\neq|\\div|\\pm|\\sqrt\{[^}]+\})/g,
        " $1 "
      );
    })
    .join("");

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

  // 수식 복구 전처리 수행
  const fixedContent = fixMathExpression(content);
  const lines = fixedContent.split("\n");

  return (
    <span className={`block w-full space-y-1 text-left ${className}`}>
      {lines.map((line, lineIndex) => {
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