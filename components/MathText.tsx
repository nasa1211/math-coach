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

  // 1. JSON/문자열 처리 과정에서 유실된 제어 문자 및 공백 복구
  const fixedContent = content
    .replace(/[\x0C]/g, "")                 
    .replace(/\\\s*[\f]?\s*rac/g, "\\frac") 
    .replace(/(\d)\s*imes\s*(\d)/g, "$1 \\times$2")
    .replace(/\bimes\b/g, "\\times")
    .replace(/\bfrac\b/g, "\\frac");

  const lines = fixedContent.split("\n");

  return (
    <span className={`block w-full space-y-1 text-left ${className}`}>
      {lines.map((line, lineIndex) => {
        const parts = line.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g);

        return (
          <span key={lineIndex} className="block leading-relaxed">
            {parts.map((part, index) => {
              if (part.startsWith("$$") && part.endsWith("$$")) {
                const math = part.slice(2, -2).trim();
                try {
                  const html = katex.renderToString(math, {
                    displayMode: false,
                    throwOnError: false,
                  });
                  return (
                    <span
                      key={index}
                      className="inline mx-1"
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
                      className="inline mx-0.5"
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
      })}
    </span>
  );
}