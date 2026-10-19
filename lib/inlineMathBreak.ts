/**
 * Split a single inline math string at top-level list commas so each item
 * can wrap onto the next line. Commas inside (), {}, [] or after a backslash
 * stay inside their item, and digit groups such as 1,000 stay together.
 */
export function splitInlineMathList(math: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < math.length; i++) {
    const ch = math[i];

    if (ch === "\\") {
      current += ch;
      if (i + 1 < math.length) {
        current += math[i + 1];
        i++;
      }
      continue;
    }

    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if ((ch === "}" || ch === ")" || ch === "]") && depth > 0) depth--;

    if (ch === "," && depth === 0 && !isThousandsComma(math, i)) {
      const piece = current.trim();
      if (piece) parts.push(piece);
      current = "";
      while (i + 1 < math.length && /\s/.test(math[i + 1])) i++;
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts.length > 1 ? parts : [math];
}

function isThousandsComma(math: string, index: number): boolean {
  const prev = math[index - 1] ?? "";
  const after = math[index + 1] ?? "";
  return /\d/.test(prev) && /\d/.test(after);
}
