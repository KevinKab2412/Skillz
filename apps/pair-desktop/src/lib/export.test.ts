import { expect, test } from "vitest";
import { exportText } from "./export";

const md = "# N\n\nMine.\n\n```pair-reply\nAgent words.\n```\n\nMore mine.\n\n```pair-diagram\n{}\n```\n";

test("just my words drops pair replies but keeps diagrams and Kevin's text", () => {
  const out = exportText(md, true);
  expect(out).not.toContain("Agent words");
  expect(out).toContain("Mine.\n\nMore mine.");
  expect(out).toContain("```pair-diagram");
  expect(exportText(md, false)).toBe(md);
});
