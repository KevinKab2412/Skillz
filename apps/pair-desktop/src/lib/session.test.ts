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

test("chat ask streams into the chat and settles", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.ask("chat", { request: "what is left?" });
  expect(r.sent[0]).toMatch(/^<pair mode="act"\/>/);
  await r.s.onRecord({ type: "pair_started" });
  expect(r.s.running).toBe(true);
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Two " } });
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "steps." } });
  await r.s.onRecord({ type: "pair_settled" });
  expect(r.s.running).toBe(false);
  expect(r.s.chat).toEqual([
    { type: "kevin", text: "what is left?" },
    { type: "agent", text: "Two steps.", done: true, kind: "chat" },
  ]);
});

test("text after a card still streams into the open agent message, which closes on settle", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.ask("doit", { selection: { text: "Use a loop.", quote: { exact: "Use a loop.", prefix: "", suffix: "" } } });
  await r.s.onRecord({ type: "pair_started" });
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Editing. " } });
  await r.s.onRecord(ui("c1", "file_edit", { tool: "edit", input: { path: "a.ts" } }));
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Done." } });
  await r.s.onRecord({ type: "pair_settled" });
  const agentItem = r.s.chat.find((c) => c.type === "agent") as { text: string; done: boolean };
  expect(agentItem).toMatchObject({ text: "Editing. Done.", done: true });
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

test("an Ask's answer lands in its thread, not the chat", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.ask("ask", { request: "why?", threadId: "t1", selection: { text: "loop", quote: { exact: "loop", prefix: "", suffix: "" } } });
  await r.s.onRecord({ type: "pair_started" });
  await r.s.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Constant stack." } });
  let threads: Thread[] = [{ id: "t1", anchor: { quote: { exact: "loop", prefix: "", suffix: "" }, pos: 0 }, messages: [], resolved: false, detached: false }];
  (r.s as any).onThreads = (f: (t: Thread[]) => Thread[]) => (threads = f(threads));
  await r.s.onRecord({ type: "pair_settled" });
  expect(threads[0].messages).toEqual([{ author: "agent", text: "Constant stack." }]);
  expect(r.s.chat).toEqual([]);
});

test("accepting a file card takes a checkpoint first; an edited command is passed on", async () => {
  const r = rig();
  ed = r.ed;
  await r.s.onRecord(ui("c1", "command", { tool: "bash", input: { command: "rm -rf build" } }));
  const card = (r.s.chat[0] as any).card;
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
