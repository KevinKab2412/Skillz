import { afterEach, expect, test } from "vitest";
import type { Editor } from "@tiptap/core";
import { NoteSession, type Transport } from "./session.svelte";
import { headless, markdownOf } from "$lib/editor/note";
import { suggestionGroups } from "$lib/editor/extensions";
import type { Note, Thread } from "$lib/api";

const MD = "# N\n\n## Think\n\nSum prices recursively.\n\n## Build\n\nUse a loop.\n";

function rig() {
  const ed = headless(MD);
  const note: Note = {
    name: "n",
    markdown: MD,
    sidecar: { v: 1, threads: [], session: { id: "s", interrupted: null }, model: null, tell: "", stage: "build" },
  };
  let threads: Thread[] = [];
  const sent: string[] = [];
  const responses: [string, any][] = [];
  const checkpoints: string[] = [];
  const transport: Transport = {
    ask: async (m) => (sent.push(m), "started"),
    stop: async () => {},
    respond: async (id, v) => void responses.push([id, v === null ? null : JSON.parse(v)]),
    checkpoint: async (label) => (checkpoints.push(label), { n: checkpoints.length }),
  };
  const s = new NoteSession(transport, () => ed, () => note, (f) => (threads = f(threads)));
  return { ed, s, sent, responses, checkpoints, threads: () => threads };
}

let ed: Editor | undefined;
afterEach(() => ed?.destroy());

const ui = (id: string, kind: string, payload: object) => ({ type: "extension_ui_request", id, method: "editor", title: `pair:${kind}`, prefill: JSON.stringify(payload) });

const thread = (id: string, messages: Thread["messages"] = []): Thread => ({ id, anchor: { quote: { exact: "loop", prefix: "", suffix: "" }, pos: 0 }, messages, resolved: false, detached: false });
const loop = { text: "loop", quote: { exact: "loop", prefix: "", suffix: "" } };

test("an answer streams under its passage, then joins its thread", async () => {
  const r = rig();
  ed = r.ed;
  let threads: Thread[] = [thread("t1", [{ author: "kevin", text: "why?" }])];
  (r.s as any).onThreads = (f: (t: Thread[]) => Thread[]) => (threads = f(threads));
  await r.s.ask("ask", { request: "why?", threadId: "t1", selection: loop });
  expect(r.sent[0]).toMatch(/^<pair mode="thread"\/>/);
  expect(r.s.workingOn("t1")).toBe(true);
  await r.s.onRecord({ type: "pair_started" });
  expect(r.s.activity).toEqual({ threadId: "t1", status: "thinking", text: "" });
  await r.s.onRecord({ type: "tool_execution_start", toolName: "read", args: { path: "src/basket.ts" } });
  expect(r.s.activity?.status).toBe("reading src/basket.ts");
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Constant " } });
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "stack." } });
  expect(r.s.activity).toMatchObject({ status: "writing", text: "Constant stack." });
  await r.s.onRecord({ type: "pair_settled" });
  expect(r.s.running).toBe(false);
  expect(r.s.activity).toBeNull();
  expect(threads[0].messages).toEqual([{ author: "kevin", text: "why?" }, { author: "agent", text: "Constant stack." }]);
});

test("a riddle that comes back empty leaves no empty thread behind", async () => {
  const r = rig();
  ed = r.ed;
  let threads: Thread[] = [thread("t1")];
  (r.s as any).onThreads = (f: (t: Thread[]) => Thread[]) => (threads = f(threads));
  await r.s.ask("riddle", { threadId: "t1", selection: loop });
  await r.s.onRecord({ type: "pair_started" });
  await r.s.onRecord({ type: "pair_settled" });
  expect(threads).toEqual([]);
});

test("cards belong to the thread of the task that asked for them", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.ask("doit", { threadId: "t9", selection: loop });
  await r.s.onRecord({ type: "pair_started" });
  await r.s.onRecord(ui("c1", "file_edit", { tool: "edit", input: { path: "a.ts" } }));
  expect(r.s.cards[0]).toMatchObject({ requestId: "c1", threadId: "t9", status: "pending" });
  expect(r.s.activity?.status).toBe("waiting for you");
});

test("a provider error is shown instead of a silent empty answer", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord({ type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "Codex error: The usage limit has been reached" } });
  expect(r.s.error).toContain("usage limit");
});

test("the prompt carries the project context", async () => {
  const r = rig();
  ed = r.ed;
  (r.s as any).context = () => ({ folder: "/w/p", files: ["src/a.ts"], openFile: "src/a.ts" });
  await r.s.ask("ask", { request: "?" });
  expect(r.sent[0]).toContain("src/a.ts open beside the note");
});

test("a note edit waits for Kevin's decision and passes the reason back", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
  expect(r.responses).toEqual([]);
  const [g] = suggestionGroups(r.ed.state.doc);
  await r.s.onSuggestionDecided(g.id, "reject", "keep it short");
  expect(r.responses).toEqual([["q1", { decision: "decline", reason: "keep it short" }]]);
});

test("a note edit on a missing passage is declined with a fixable reason", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord(ui("q1", "note_edit", { find: "nope", replace: "x" }));
  expect(r.responses[0][1].decision).toBe("decline");
  expect(r.responses[0][1].reason).toContain("not in the note");
});

test("agent threads attach to quoted passages; replies go into existing threads", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord(ui("q1", "thread", { quote: { exact: "recursively" }, text: "Stack depth?" }));
  expect(r.threads()).toHaveLength(1);
  const id = r.threads()[0].id;
  expect(r.responses[0][1]).toEqual({ decision: "accept", note: `thread_id ${id}` });
  await r.s.onRecord(ui("q2", "thread", { thread_id: id, text: "Also memory." }));
  expect(r.threads()[0].messages.map((m) => m.text)).toEqual(["Stack depth?", "Also memory."]);
  await r.s.onRecord(ui("q3", "thread", { quote: { exact: "absent" }, text: "?" }));
  expect(r.responses[2][1].decision).toBe("decline");
});

test("accepting a file card takes a checkpoint first; an edited command is passed on", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord(ui("c1", "command", { tool: "bash", input: { command: "rm -rf build" } }));
  const card = r.s.cards[0];
  expect(card.status).toBe("pending");
  await r.s.decideCard(card, "accept", { command: "rm -rf build/tmp" });
  expect(r.checkpoints).toEqual(["run: rm -rf build/tmp"]);
  expect(r.responses).toEqual([["c1", { decision: "accept", command: "rm -rf build/tmp" }]]);
  expect(card.status).toBe("accepted");
  await r.s.decideCard(card, "reject");
  expect(r.responses).toHaveLength(1);
});

test("a diagram proposal lands as a block suggestion and resolves on accept", async () => {
  const r = rig();
  ed = r.ed;
  const spec = { v: 1, title: "T", objects: [{ id: "t", kind: "text", text: "x" }], steps: [{ caption: "a" }, { caption: "b" }] };
  await r.s.onRecord(ui("d1", "diagram", { spec }));
  const [g] = suggestionGroups(r.ed.state.doc);
  expect(g.block).toBe(true);
  expect(markdownOf(r.ed)).not.toContain("pair-diagram");
  await r.s.onSuggestionDecided(g.id, "accept");
  expect(r.responses).toEqual([["d1", { decision: "accept" }]]);
});

test("unknown UI dialogs are cancelled so the agent never hangs", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord({ type: "extension_ui_request", id: "x", method: "confirm", title: "Sure?" });
  expect(r.responses).toEqual([["x", null]]);
});

test("a crash during a task is surfaced", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord({ type: "pair_exited", code: 3, stderr: "boom", during_task: true });
  expect(r.s.crash).toEqual({ stderr: "boom", code: 3 });
});
