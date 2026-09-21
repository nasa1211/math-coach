// components/MathText.tsx
"use client";

import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  content: string;
  className?: string;
}

export default function MathText({ content, className = "" }: MathTextProps) {
  if (!content) return null;

  // 1. JSON/문자열 처리 과정에서 유실되거나 제어 문자로 변환된 특수 기호 및 공백 복구
  const fixedContent = content
    .replace(/[\x0C]/g, "")                 // 숨겨진 폼 피드(\f) 제어 문자 제거
    .replace(/\\\s*[\f]?\s*rac/g, "\\frac") // \ rac, \rac 등 공백이나 깨진 분수 표현 교정
    .replace(/(\d)\s*imes\s*(\d)/g, "$1 \\times$2")
    .replace(/\bimes\b/g, "\\times")
    .replace(/\bfrac\b/g, "\\frac");

  // 2. 정규식으로 $$...$$ (블록 수식) 및 $...$ (인라인 수식) 분리
  const parts = fixedContent.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

  return (
    <span 
      className={`inline-block max-w-full overflow-x-auto align-middle ${className}`}
      style={{
        touchAction: "pan-x pan-y pinch-zoom",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {parts.map((part, index) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          const math = part.slice(2, -2).trim();
          try {
            const html = katex.renderToString(math, {
              displayMode: true,
              throwOnError: false,
            });
            return (
              <span
                key={index}
                className="block my-2 text-center"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        } else if (part.startsWith("$") && part.endsWith("$")) {
          const math = part.slice(1, -1).trim();
          try {
            const html = katex.renderToString(math, {
              displayMode: false,
              throwOnError: false,
            });
            return (
              <span
                key={index}
                className="inline-block align-baseline mx-0.5"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}