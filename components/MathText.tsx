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

  // 1. 유령 제어문자 및 역슬래시 탈락 복구 (중괄호와 숫자 절대 보존)
  let text = content
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/(^|[^\\])times\b/g, "$1\\times ")
    .replace(/(^|[^\\])div\b/g, "$1\\div ")
    .replace(/(^|[^\\])left\(/g, "$1\\left(")     .replace(/(^\vert{}[^\\])right\)/g, "$1\\right)")
    .replace(/(^|[^\\])frac\{/g, "$1\\frac{");

  // 2. 이미 $...$ 로 감싸진 정상 수식 보호
  const preserved: string[] = [];
  text = text.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__MATH_SAFE_${preserved.length - 1}__`;
  });

  // 3. 복합 연산식 통째로 감지하여 $...$ 래핑
  const mathFormulaRegex =
    /((?:\([+\-]?[0-9a-zA-Z./\\]+\)|\\[a-zA-Z]+(?:\{[^{}]+\})*|[+\-]?[0-9a-zA-Z./]+)\s*(?:\\times|\\div|[+\-*=/]|<|>|<=|>=)\s*)+(?:\([+\-]?[0-9a-zA-Z./\\]+\)|\\[a-zA-Z]+(?:\{[^{}]+\})*|[+\-]?[0-9a-zA-Z./]+)/g;

  text = text.replace(mathFormulaRegex, (match) => {
    if (match.includes("__MATH_SAFE_")) return match;
    let expr = match.trim();
    if (expr.includes("\\frac") && !expr.includes("\\displaystyle")) {
      expr = `\\displaystyle ${expr}`;
    }
    return `$${expr}$`;
  });

  // 4. 개별 분수 래핑
  text = text.replace(
    /(?<!\$)([+\-]?\s*\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$\\displaystyle ${m.trim()}$`
  );

  // 5. 보호한 수식 복원
  text = text.replace(/__MATH_SAFE_(\d+)__/g, (_, idx) => {
    let original = preserved[Number(idx)].trim();
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
        {text}
      </ReactMarkdown>
    </div>
  );
}