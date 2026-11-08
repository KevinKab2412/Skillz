import { describe, expect, test } from "bun:test";
import { decide, inside, readHeader, type Mode, type Stage } from "./policy";

const cwd = "/work/proj";
const d = (toolName: string, input: Record<string, unknown>, stage: Stage = "build", mode: Mode = "act") =>
  decide({ toolName, input, cwd, stage, mode });

describe("reads", () => {
  test("inside the folder pass in every stage and mode", () => {
    for (const stage of ["think", "plan", "build", "review"] as Stage[]) {
      expect(d("read", { path: "src/a.ts" }, stage, "thread")).toEqual({ action: "pass" });
      expect(d("grep", { pattern: "x" }, stage, "thread")).toEqual({ action: "pass" });
    }
  });
  test("outside the folder need approval", () => {
    expect(d("read", { path: "/etc/hosts" })).toEqual({ action: "propose", kind: "read_outside" });
    expect(d("ls", { path: "../other" })).toEqual({ action: "propose", kind: "read_outside" });
  });
});

describe("file edits", () => {
  test("are proposals in Build", () => {
    expect(d("edit", { path: "src/a.ts" })).toEqual({ action: "propose", kind: "file_edit" });
    expect(d("write", { path: "/work/proj/new.md" })).toEqual({ action: "propose", kind: "file_edit" });
  });
  test("are blocked before Build, with a reason naming the stage", () => {
    for (const stage of ["think", "plan", "review"] as Stage[]) {
      const r = d("write", { path: "a.ts" }, stage);
      expect(r.action).toBe("block");
      expect((r as { reason: string }).reason.toLowerCase()).toContain(stage);
    }
  });
  test("never leave the folder or touch .pair", () => {
    expect(d("write", { path: "../escape.ts" }).action).toBe("block");
    expect(d("write", { path: "/work/projX/a.ts" }).action).toBe("block");
    expect(d("edit", { path: ".pair/notes/n.md" }).action).toBe("block");
    expect(d("write", { path: "src/../.pair/x" }).action).toBe("block");
    expect(d("write", { path: ".pairing/ok.ts" })).toEqual({ action: "propose", kind: "file_edit" });
  });
});

describe("commands", () => {
  test("are proposals only in Build", () => {
    expect(d("bash", { command: "bun test" })).toEqual({ action: "propose", kind: "command" });
    expect(d("bash", { command: "ls" }, "plan").action).toBe("block");
  });
});

describe("thread mode (Thinks-with-you, Riddle, Ask)", () => {
  test("allows only reads and threads", () => {
    expect(d("add_thread", { quote: "x", text: "y" }, "build", "thread")).toEqual({ action: "pass" });
    for (const t of ["edit", "bash", "suggest_note_edit", "add_diagram"]) {
      expect(d(t, { path: "a.ts" }, "build", "thread").action).toBe("block");
    }
  });
});

describe("note tools by stage", () => {
  test("note edits in Plan and Build only", () => {
    expect(d("suggest_note_edit", {}, "plan")).toEqual({ action: "pass" });
    expect(d("suggest_note_edit", {}, "build")).toEqual({ action: "pass" });
    expect(d("suggest_note_edit", {}, "think").action).toBe("block");
    expect(d("suggest_note_edit", {}, "review").action).toBe("block");
  });
  test("diagrams on explicit asks in any stage; verdict only in Review", () => {
    expect(d("add_diagram", {}, "think")).toEqual({ action: "pass" });
    expect(d("review_verdict", {}, "review")).toEqual({ action: "pass" });
    expect(d("review_verdict", {}, "build").action).toBe("block");
  });
  test("unknown tools need approval in Build and are blocked elsewhere", () => {
    expect(d("mcp__x__y", {})).toEqual({ action: "propose", kind: "tool" });
    expect(d("mcp__x__y", {}, "think").action).toBe("block");
  });
});

test("inside() handles prefixes and relative escapes", () => {
  expect(inside(cwd, ".")).toBe(true);
  expect(inside(cwd, "/work/proj")).toBe(true);
  expect(inside(cwd, "/work/project2/a")).toBe(false);
  expect(inside(cwd, "a/../../b")).toBe(false);
});

test("readHeader strips the mode header", () => {
  expect(readHeader('<pair mode="thread"/>\nhello')).toEqual({ mode: "thread", text: "hello" });
  expect(readHeader("plain")).toEqual({ mode: null, text: "plain" });
});
