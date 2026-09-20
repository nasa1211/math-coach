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

  // 1. JSON 직렬화 과정에서 탈락한 백슬래시 및 깨진 LaTeX 명령어 자동 복구
  let repaired = content
    // \f가 증발하여 ' rac' 또는 '-rac'이 된 경우 복구
    .replace(/(^|[^a-zA-Z\\])rac\{/g, "$1\\frac{")
    .replace(/(^|[^a-zA-Z\\])dfrac\{/g, "$1\\dfrac{")
    // \t가 탭 문자로 바뀌어 'imes'가 된 경우 복구
    .replace(/(^|[^a-zA-Z\\])imes\b/g, "$1\\times ")
    // \d가 날아간 'div' 복구
    .replace(/(^|[^a-zA-Z\\])div\b/g, "$1\\div ")
    // \s가 날아간 'qrt' 복구
    .replace(/(^|[^a-zA-Z\\])qrt\{/g, "$1\\sqrt{");

  // 2. 이미 $...$ 로 감싸진 수식 임시 보호
  const preserved: string[] = [];
  let sanitized = repaired.replace(/\$([^$]+?)\$/g, (_, math) => {
    preserved.push(math);
    return `__PRESERVED_${preserved.length - 1}__`;
  });

  // 3. 수식 기호(\frac, \times, ^, _, \left 등)가 포함된 문장을 감지하여 $...$ 자동 래핑
  const lines = sanitized.split("\n").map((line) => {
    const hasLatex = /\\(frac|dfrac|times|div|sqrt|left|right|pm)/.test(line);
    if (!hasLatex) return line;

    // 앞의 리스트 원문자/번호(• ①, 1.) 분리
    const match = line.match(/^([\s\t*•\-\d().①-⑩]*\s*)([\s\S]+)$/);
    if (match && match[2]) {
      const prefix = match[1] || "";
      const body = match[2].trim();
      if (!body.startsWith("$") && !body.endsWith("$")) {
        return `${prefix}$${body}$`;
      }
    }
    return line;
  });

  let processed = lines.join("\n");

  // 4. 문장 중간에 덩그러니 놓인 인라인 분수(\frac{a}{b}) 개별 $ 래핑
  processed = processed.replace(
    /(?<!\$)([+\-]?\\(?:frac|dfrac)\{[^{}]+\}\{[^{}]+\})(?!\$)/g,
    (m) => `$${m.trim()}$`
  );

  // 5. 보호했던 수식 복원
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