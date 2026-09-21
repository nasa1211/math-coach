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

  // 1. JSON 파싱 과정에서 유실된 '\t'로 인해 깨진 'imes'를 '\times'로 복구
  const fixedContent = content
    .replace(/(\d)\s*imes\s*(\d)/g, "$1 \\times$2")
    .replace(/\bimes\b/g, "\\times");

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