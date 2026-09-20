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

  // 1. 유령 제어문자(Form Feed \x0c, \f 등) 및 오염된 문자열 1차 청소
  let cleaned = content
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "") // 보이지 않는 숨은 제어문자 일괄 제거
    .replace(/rac\{/g, "\\frac{")
    .replace(/(^|[^\\])times\b/g, "$1\\times ")
    .replace(/(^|[^\\])div\b/g, "$1\\div ");

  // 2. 이미 $...$ 로 묶여있는 수식 보호
  const preserved: string[] = [];
  cleaned = cleaned.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__MATH_${preserved.length - 1}__`;
  });

  // 3. 문장 속에서 괄호/숫자/수식이 결합된 식 전체를 감지해 $...$ 로 래핑
  // 예: (-0.2) \times (- \frac{6}{11}) \times (-5)
  // 예: \displaystyle (-0.2) \times ...
  // 예: -\frac{6}{11}
  const mathFormulaRegex =
    /(?:\\displaystyle\s*)?(?:[+\-]?\s*(?:\([^\)\n]+\)|[0-9a-zA-Z\.]+|\\frac\{[^{}]+\}\{[^{}]+\})\s*(?:\\times|\\div|[+\-*=/]|<|>|<=|>=|!=|=)\s*)+(?:\([^\)\n]+\)|[0-9a-zA-Z\.]+|\\frac\{[^{}]+\}\{[^{}]+\})/g;

  cleaned = cleaned.replace(mathFormulaRegex, (match) => {
    // 이미 래핑된 플레이스홀더가 포함되어 있다면 스킵
    if (match.includes("__MATH_")) return match;
    const cleanExpr = match.replace(/\\displaystyle\s*/g, "").trim();
    return `$\\displaystyle ${cleanExpr}$`;
  });

  // 4. 단독으로 남아있는 분수 및 음수 분수 (예: -\frac{6}{11}, \frac{1}{5}) 래핑
  cleaned = cleaned.replace(
    /(?<!\$)(?:\\displaystyle\s*)?([+\-]?\s*\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (_, frac) => `$\\displaystyle ${frac.trim()}$`
  );

  // 5. 보호했던 수식 복원 (분수가 들어있으면 \displaystyle 적용하여 겹침 방지)
  cleaned = cleaned.replace(/__MATH_(\d+)__/g, (_, idx) => {
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
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}