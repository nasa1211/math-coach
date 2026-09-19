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

  // 1. 역슬래시 이스케이프가 풀려버린 경우 대비 (\frac -> \\frac 보정)
  let text = content;

  // 2. 이미 $...$ 로 감싸진 정상 수식은 임시 보존 (치환 방지)
  const mathBlocks: string[] = [];
  text = text.replace(/\$([^\$]+?)\$/g, (_, math) => {
    mathBlocks.push(math);
    return `__MATH_PLACEHOLDER_${mathBlocks.length - 1}__`;
  });

  // 3. $ 없이 날것으로 남은 수식 패턴 통째로 감싸기
  // 원문자(①~⑩)나 숫자 뒤에 나오는 수식 라인 전체 감지
  // 예: "② \left(-\frac{1}{28}\right) \times (-4) = +\frac{1}{7}"
  text = text.replace(
    /((?:[+\-]?\\(?:left\vert{}frac\vert{}times\vert{}div\vert{}pm\vert{}sqrt)[^$\n]+?(?:=[^$\n]+?)?))(?=[\s,\.\)\]]|$)/g,
    (match) => {
      // 불필요한 앞뒤 공백 정리 후 $ 로 감싸기
      const trimmed = match.trim();
      if (trimmed.length > 0) {
        return `$${trimmed}$`;
      }
      return match;
    }
  );

  // 개별적으로 덩그러니 남은 \frac{...}{...} 등 보완
  text = text.replace(
    /(?<!\$)([\+\-]?\\(?:frac|left|right)[^\$\n]+?)(?!\$)(?=\s|$)/g,
    (m) => `$${m.trim()}$`
  );

  // 4. 임시 보존해 둔 정상 $...$ 블록 복원
  text = text.replace(/__MATH_PLACEHOLDER_(\d+)__/g, (_, idx) => {
    return `$${mathBlocks[Number(idx)]}$`;
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