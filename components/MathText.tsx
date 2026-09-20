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

  // 1. 유령 제어문자(Form feed \x0c, Tab 등) 제거 및 백슬래시 탈락 복원
  let text = content
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "")
    // \frac 앞의 제어문자나 백슬래시 탈락 복원 (중괄호 보존)
    .replace(/(^|[^\\])frac\{/g, "$1\\frac{")
    .replace(/(^|[^\\])dfrac\{/g, "$1\\dfrac{")
    .replace(/(^|[^\\])times\b/g, "$1\\times ")
    .replace(/(^|[^\\])div\b/g, "$1\\div ")
    .replace(/(^|[^\\])left\(/g, "$1\\left(")     .replace(/(^\vert{}[^\\])right\)/g, "$1\\right)");

  // 2. 이미 존재하는 정상 $...$ 수식 임시 보호
  const preserved: string[] = [];
  text = text.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__MATH_SAFE_${preserved.length - 1}__`;
  });

  // 3. 문장 속에서 수식 명령어(\frac, \times 등)가 포함된 덩어리를 통째로 $...$ 로 래핑
  // (분자 숫자를 깎아먹는 위험한 숫자 치환 정규식 완전 제거)
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

  // 4. 단독으로 남아있는 분수 (예: -\frac{6}{11}) $...$ 래핑
  text = text.replace(
    /(?<!\$)([+\-]?\s*\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$\\displaystyle ${m.trim()}$`
  );

  // 5. 보호했던 수식 복원
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