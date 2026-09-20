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

  // 1. 보이지 않는 제어문자 제거 및 깨진 문자열(\t, \f) 복원
  let text = content
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "")
    // 깨진 \times 및 \frac 복원
    .replace(/(^|[^a-zA-Z\\])imes\b/g, "$1\\times ")
    .replace(/(^|[^a-zA-Z\\])rac\{/g, "$1\\frac{");

  // 2. 이미 $...$ 로 묶인 수식 보호
  const preserved: string[] = [];
  text = text.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__MATH_SAFE_${preserved.length - 1}__`;
  });

  // 3. 연산식 전체(예: (-0.2) \times (-5) \times \frac{6}{11})를 탐지하여 $...$ 자동 래핑
  text = text.replace(
    /((?:\([+\-]?[0-9a-zA-Z./\\]+\)|[+\-]?[0-9a-zA-Z./\\]+|\\frac\{[^{}]+\}\{[^{}]+\})\s*(?:\\times|\\div|[+\-*=/]|<|>|<=|>=)\s*)+(?:\([+\-]?[0-9a-zA-Z./\\]+\)|[+\-]?[0-9a-zA-Z./\\]+|\\frac\{[^{}]+\}\{[^{}]+\})/g,
    (m) => {
      if (m.includes("__MATH_SAFE_")) return m;
      return `$${m.trim()}$`;
    }
  );

  // 4. 개별 분수(예: -\frac{6}{11}, \frac{1}{5}) 래핑
  text = text.replace(
    /(?<!\$)([+\-]?\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$${m.trim()}$`
  );

  // 5. 보호한 수식 복원
  text = text.replace(/__MATH_SAFE_(\d+)__/g, (_, idx) => {
    return `$${preserved[Number(idx)]}$`;
  });

  return (
    <div className="math-content leading-relaxed inline-block max-w-full overflow-x-auto align-middle">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}