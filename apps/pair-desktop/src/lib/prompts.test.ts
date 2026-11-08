import { expect, test } from "vitest";
import { buildPrompt, modeOf } from "./prompts";
import { readHeader } from "$pi/policy";

test("thread-only asks are marked so the extension blocks changes", () => {
  expect(modeOf("passive")).toBe("thread");
  expect(modeOf("riddle")).toBe("thread");
  expect(modeOf("ask")).toBe("thread");
  expect(modeOf("doit")).toBe("act");
  expect(modeOf("chat")).toBe("act");
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
  expect(buildPrompt({ kind: "chat", stage: "build", tell: "  ", note: "", noteName: "n", request: "hi" })).not.toContain("standing instruction");
});
