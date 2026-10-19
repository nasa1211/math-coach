import { describe, expect, it } from "vitest";
import { splitInlineMathList } from "@/lib/inlineMathBreak";

describe("splitInlineMathList", () => {
  it("쉼표 뒤에 공백이 있는 숫자 목록은 항목별로 나눈다", () => {
    expect(splitInlineMathList("600, 1200, 1800, 2400")).toEqual(["600", "1200", "1800", "2400"]);
  });

  it("천 단위 쉼표와 괄호 안 쉼표는 나누지 않는다", () => {
    expect(splitInlineMathList("1,000")).toEqual(["1,000"]);
    expect(splitInlineMathList("(1, 2), (3, 4)")).toEqual(["(1, 2)", "(3, 4)"]);
  });
});
