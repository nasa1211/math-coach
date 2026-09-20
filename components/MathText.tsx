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

  let text = content
    // 1. 유령 제어문자(Form feed \x0c, Tab 등) 제거
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "")
    // 2. 백슬래시가 탈락한 LaTeX 명령어 원상복구 (오타 수정 완료)
    .replace(/(^|[^\\])times\b/g, "$1\\times ")
    .replace(/(^|[^\\])div\b/g, "$1\\div ")
    .replace(/(^|[^\\])left\(/g, "$1\\left(")     .replace(/(^\vert{}[^\\])right\)/g, "$1\\right)")
    // 3. 중괄호까지 깨진 frac 복구 (예: frac611 -> \frac{6}{11}, frac37 -> \frac{3}{7})
    .replace(/(^|[^\\])frac([0-9])([0-9]+)/g, "$1\\frac{$2}{$3}")
    .replace(/(^|[^\\])frac\{/g, "$1\\frac{");

  // 4. 이미 $...$ 로 묶인 정상 수식 보호
  const preserved: string[] = [];
  text = text.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__MATH_LOCK_${preserved.length - 1}__`;
  });

  // 5. 연산식이 포함된 문장 통째로 감지하여 $...$ 자동 래핑
  const mathFormulaRegex =
    /((?:\([+\-]?[0-9a-zA-Z./\\]+\)|\\[a-zA-Z]+(?:\{[^{}]+\})*|[+\-]?[0-9a-zA-Z./]+)\s*(?:\\times|\\div|[+\-*=/]|<|>|<=|>=)\s*)+(?:\([+\-]?[0-9a-zA-Z./\\]+\)|\\[a-zA-Z]+(?:\{[^{}]+\})*|[+\-]?[0-9a-zA-Z./]+)/g;

  text = text.replace(mathFormulaRegex, (match) => {
    if (match.includes("__MATH_LOCK_")) return match;
    let expr = match.trim();
    // 분수가 포함되어 있다면 \displaystyle을 붙여 상하 간격을 시원하게 확보
    if (expr.includes("\\frac") && !expr.includes("\\displaystyle")) {
      expr = `\\displaystyle ${expr}`;
    }
    return `$${expr}$`;
  });

  // 6. 단독으로 남아있는 분수 (예: -\frac{6}{11}) $...$ 래핑
  text = text.replace(
    /(?<!\$)([+\-]?\\frac\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$\\displaystyle ${m.trim()}$`
  );

  // 7. 보호된 수식 복원
  text = text.replace(/__MATH_LOCK_(\d+)__/g, (_, idx) => {
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