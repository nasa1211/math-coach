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
 * 텍스트 전처리: 줄바꿈 조절 및 불필요 제어 문자 제거
 */
function preprocessText(str: string): string {
  if (!str) return "";

  let res = str;

  // 1. 제어 문자 제거
  res = res.replace(/[\x0C]/g, "");

  // 2. 마침표/문장부호 뒤에 뭉쳐 나온 보기 번호(①~⑩) 앞에만 줄바꿈 삽입
  res = res.replace(/([.!?])\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, "$1\n$2");

  // 3. 단계 구분어(1단계:, 2단계:) 앞에 자동 줄바꿈
  res = res.replace(/([^\n])\s*(\d+단계:)/g, "$1\n$2");

  return res;
}

/**
 * KaTeX 수식 구문 정제 (누락된 역슬래시 보정)
 */
function cleanLatexForKatex(mathStr: string): string {
  return mathStr
    .replace(/(?<!\\)\b(frac|times|div|pm|neq|sqrt|pi|left|right)\b/g, "\\$1")
    .replace(/\\frac\s*([0-9]{1,2})\s*([0-9]{2})(?![0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([0-9])\s*([0-9])(?![0-9])/g, "\\frac{$1}{$2}");
}

export default function MathText({ content, className = "" }: MathTextProps) {
  if (!content) return null;

  const fixedContent = preprocessText(content);
  const lines = fixedContent.split("\n");

  return (
    <span className={`block w-full space-y-1.5 text-left ${className}`}>
      {lines.map((line, lineIndex) => {
        if (!line.trim()) return null;

        // $$...$$ (블록 수식) 또는 $...$ (인라인 수식) 분할
        const parts = line.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

        return (
          <span key={lineIndex} className="block leading-relaxed">
            {parts.map((part, index) => {
              if (!part) return null;

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