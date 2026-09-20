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

  // 1. JSON 이스케이프로 인해 깨진 제어문자(\x0c=FormFeed, \t=Tab) 원천 복구
  let text = content
    // \f가 공백문자(\x0c)로 바뀐 채 뒤에 frac이 붙은 것 복구: \frac -> \frac
    .replace(/[\x0c\f]\s*\\?frac/g, "\\frac")
    // \f가 날아가서 rac만 남은 것 복구: rac{ -> \frac{
    .replace(/(^|[^a-zA-Z\\])rac\{/g, "$1\\frac{")
    // \t가 탭 문자로 바뀐 것 복구: imes -> \times
    .replace(/[\t]\s*\\?times/g, "\\times")
    .replace(/(^|[^a-zA-Z\\])imes\b/g, "$1\\times");

  // 2. 이미 $...$ 로 감싸진 수식 임시 보호
  const preserved: string[] = [];
  let sanitized = text.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__PRESERVED_${preserved.length - 1}__`;
  });

  // 3. 문장 줄 단위로 수식(\frac, \times, ^, _, \left 등) 자동 래핑 및 \displaystyle 적용
  const lines = sanitized.split("\n").map((line) => {
    const hasLatex = /\\(frac|times|div|sqrt|left|right|pm)/.test(line);
    if (!hasLatex) return line;

    // 리스트 기호/원문자(• ①, 1.) 분리
    const match = line.match(/^([\s\t*•\-\d().①-⑩]*\s*)([\s\S]+)$/);
    if (match && match[2]) {
      const prefix = match[1] || "";
      let formula = match[2].trim();

      if (!formula.startsWith("$") && !formula.endsWith("$")) {
        // \frac이 있으면 분자가 분모와 겹치지 않도록 \displaystyle 부여
        if (formula.includes("\\frac") && !formula.includes("\\displaystyle")) {
          formula = `\\displaystyle ${formula}`;
        }
        return `${prefix}$${formula}$`;
      }
    }
    return line;
  });

  let processed = lines.join("\n");

  // 4. 문장 중간에 섞여 있는 잔여 \frac 인라인 수식 처리
  processed = processed.replace(
    /(?<!\$)([+\-]?\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$\\displaystyle ${m.trim()}$`
  );

  // 5. 보호했던 수식 복원
  processed = processed.replace(/__PRESERVED_(\d+)__/g, (_, idx) => {
    let original = preserved[Number(idx)];
    if (original.includes("\\frac") && !original.includes("\\displaystyle")) {
      original = `\\displaystyle ${original}`;
    }
    return `$${original}$`;
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