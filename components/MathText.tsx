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

  // 1. 이미 $...$로 감싸진 수식 임시 보호
  const preserved: string[] = [];
  const sanitized = content.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__PRESERVED_${preserved.length - 1}__`;
  });

  // 2. 줄 단위 수식 감지 및 안전한 래핑
  const lines = sanitized.split("\n").map((line) => {
    const hasLatex = /\\(frac|left|right|times|div|pm|sqrt)/.test(line);
    if (!hasLatex) return line;

    // 리스트 기호/원문자(prefix)와 수식 분리
    const matchResult = line.match(/^([\s\t*•\-\d().①-⑩]*\s*)([\s\S]+)$/);
    if (matchResult && matchResult[2]) {
      const prefix = matchResult[1] || "";
      const formula = matchResult[2].trim();

      if (!formula.startsWith("$") && !formula.endsWith("$")) {
        return `${prefix}$${formula}$`;
      }
    }

    return line;
  });

  let processed = lines.join("\n");

  // 3. 인라인 미감싸기 수식 보완
  processed = processed.replace(
    /(?<!\$)([+\-]?\\(?:frac|left|right)[^$\n]+?)(?!\$)(?=\s|[,.)\]]|$)/g,
    (m) => `$${m.trim()}$`
  );

  // 4. 보호 수식 복원
  processed = processed.replace(/__PRESERVED_(\d+)__/g, (_, idx) => {
    return `$${preserved[Number(idx)]}$`;
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