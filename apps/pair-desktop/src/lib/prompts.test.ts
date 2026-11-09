import { expect, test } from "vitest";
import { buildPrompt, MAX_LISTED_FILES, modeOf } from "./prompts";
import { readHeader } from "$pi/policy";

test("thread-only asks are marked so the extension blocks changes", () => {
  expect(modeOf("passive")).toBe("thread");
  expect(modeOf("riddle")).toBe("thread");
  expect(modeOf("ask")).toBe("thread");
  expect(modeOf("doit")).toBe("act");
  expect(modeOf("inline")).toBe("act");
});

test("the prompt carries header, stage, Tell line, note and selection, and the extension can read it", () => {
  const p = buildPrompt({ kind: "riddle", stage: "plan", tell: "be terse", note: "# N\n\nbody", noteName: "n", selection: "body" });
  const { mode, text } = readHeader(p);
  expect(mode).toBe("thread");
  expect(text).toContain("Stage: PLAN");
  expect(text).toContain("standing instruction for this note: be terse");
  expect(text).toContain('<note name="n">\n# N\n\nbody\n</note>');
  expect(text).toContain("<selection>\nbody\n</selection>");
  expect(text).not.toContain("<request>");
});

test("an empty Tell line is left out", () => {
  expect(buildPrompt({ kind: "inline", stage: "build", tell: "  ", note: "", noteName: "n", request: "hi" })).not.toContain("standing instruction");
});

test("pair is told it can read the project, what is in it and which file is open", () => {
  const files = Array.from({ length: MAX_LISTED_FILES + 5 }, (_, i) => `src/f${i}.ts`);
  const p = buildPrompt({ kind: "ask", stage: "think", tell: "", note: "", noteName: "n", folder: "/w/proj", files, openFile: "src/basket.ts" });
  expect(p).toContain("working directory (/w/proj)");
  expect(p).toContain("never ask Kevin where the code is");
  expect(p).toContain("src/f0.ts");
  expect(p).not.toContain(`src/f${MAX_LISTED_FILES}.ts`);
  expect(p).toContain("… and 5 more");
  expect(p).toContain("Kevin has src/basket.ts open beside the note");
});
