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

  // 1. 이미 올바르게 $...$로 감싸진 수식을 보호
  const preservedMath: string[] = [];
  let sanitized = content.replace(/\$([^\$]+?)\$/g, (_, math) => {
    preservedMath.push(math);
    return `__PRESERVED_MATH_${preservedMath.length - 1}__`;
  });

  // 2. 줄(Line) 단위로 쪼개어 수식 명령어 감지 및 자동 래핑
  const lines = sanitized.split("\n").map((line) => {
    // 해당 줄에 LaTeX 수식 기호가 있는지 확인
    const hasLatex = /\\(frac\vert{}left\vert{}right\vert{}times\vert{}div\vert{}pm\vert{}sqrt)/.test(line);     if (!hasLatex) return line;      // "• ② \left(-\frac{1}{28}\right)..." 또는 "② \left..." 형태 감지     // 앞쪽의 리스트 기호나 원문자(①~⑩, (1)~(10), 1.)를 캡처하고 수식 부분만 분리     const prefixMatch = line.match(/^([\s\t*•\-\d\(\)①-⑩\.]*\s*)([\s\S]+)$/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const formula = prefixMatch[2].trim();

      // 수식 부분에 아직 $가 없다면 통째로 $...$ 래핑
      if (!formula.startsWith("$") && !formula.endsWith("$")) {
        return `${prefix}$${formula}$`;
      }
    }

    return line;
  });

  let processed = lines.join("\n");

  // 3. 인라인 문장 중간에 섞여있는 잔여 \frac{...}{...} 등 개별 수식 보정보완
  processed = processed.replace(
    /(?<!\$)([+\-]?\\(?:frac\vert{}left\vert{}right)[^\$\n]+?)(?!\$)(?=\s\vert{}[,\.\)\]]|$)/g,
    (m) => `$${m.trim()}$`
  );

  // 4. 보호해 두었던 원래 $...$ 수식 복원
  processed = processed.replace(/__PRESERVED_MATH_(\d+)__/g, (_, idx) => {
    return `$${preservedMath[Number(idx)]}$`;
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