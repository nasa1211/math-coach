// components/MathText.tsx
"use client";

import React from "react";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface MathTextProps {
  content: string;
}

export default function MathText({ content }: MathTextProps) {
  if (!content) return null;

  // 1. $ 없이 날것으로 나온 LaTeX 명령어(\frac, \times, \left, \right 등)를 $...$로 자동 래핑
  let processed = content
    // 이미 $로 감싸진 부분은 건너뛰고, 독립된 \left( ... \right) 패턴 래핑
    .replace(/(?<!\$)\\left\([^\$]+?\\right\)(?!\$)/g, (match) => `$${match}$`)
    // 남아있는 단독 \frac{...}{...} 패턴 래핑
    .replace(/(?<!\$)\\frac\{[^\}]+\}\{[^\}]+\}(?!\$)/g, (match) => `$${match}$`)
    // 이스케이프 깨짐 방지 (\times 주변)
    .replace(/(?<!\$)([+\-]?\\frac\{[^$]+\}(?:\s*\\times\s*[+\-]?\\frac\{[^$]+\})*)(?!\$)/g, (match) => {
      if (match.includes("\\frac") && !match.startsWith("$")) return `$${match}$`;
      return match;
    });

  return (
    <div className="math-content leading-relaxed inline-block max-w-full overflow-x-auto align-middle">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}