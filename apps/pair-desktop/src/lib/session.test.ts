import { afterEach, describe, expect, test } from "vitest";
import type { Editor } from "@tiptap/core";
import { NoteSession, type Transport } from "./session.svelte";
import { accept, headless, markdownOf } from "$lib/editor/note";
import { suggestionGroups } from "$lib/editor/extensions";
import type { Note, Thread } from "$lib/api";

const MD = "# N\n\n## Think\n\nSum prices recursively.\n\n## Build\n\nUse a loop.\n";

function rig() {
  const ed = headless(MD);
  const note: Note = {
    name: "n",
    markdown: MD,
    sidecar: { v: 2, threads: [], proposals: [], approvals: [], session: { id: "s", interrupted: null }, model: null, tell: "", stage: "build" },
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
  let saves = 0;
  const s = new NoteSession(transport, () => ed, () => note, (f) => (threads = f(threads)), () => ({}), () => saves++);
  return { ed, s, note, sent, responses, checkpoints, threads: () => threads, saves: () => saves };
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

describe("pending work is saved with the note", () => {
  test("a note edit is saved with the agent's request until Kevin answers it", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
    expect(r.saves()).toBe(1);
    const { proposals } = r.s.saved();
    expect(proposals).toEqual([expect.objectContaining({ kind: "edit", replace: "Use a for loop", request_id: "q1", anchor: { quote: { exact: "Use a loop", prefix: expect.any(String), suffix: expect.any(String) }, pos: expect.any(Number) } })]);
    const [g] = suggestionGroups(r.ed.state.doc);
    await r.s.onSuggestionDecided(g.id, "accept");
    expect(r.responses).toEqual([["q1", { decision: "accept" }]]);
    expect(r.s.saved().proposals).toEqual([]);
  });

  test("reopened, proposals come back as suggestions that no agent waits on", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
    await r.s.onRecord(ui("q2", "verdict", { ready: true, summary: "ship it" }));
    const saved = r.s.saved();
    const md = markdownOf(r.ed);
    r.ed.destroy();

    const again = rig();
    again.ed.commands.setContent(md, { contentType: "markdown" } as never);
    ed = again.ed;
    expect(again.s.restore(saved)).toBe(0);
    const groups = suggestionGroups(again.ed.state.doc);
    expect(groups.map((g) => g.ins || (g.block ? "block" : ""))).toEqual(["Use a for loop", "block"]);
    for (const g of groups) {
      accept(again.ed, g.id);
      await again.s.onSuggestionDecided(g.id, "accept");
    }
    expect(again.responses).toEqual([]);
    expect(markdownOf(again.ed)).toContain("Use a for loop.");
    expect(markdownOf(again.ed)).toContain("Ready: ship it");
  });

  test("an approval is saved while pending and comes back expired; dismissing removes it", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "command", { tool: "bash", input: { command: "bun test" } }));
    const saved = r.s.saved();
    expect(saved.approvals).toEqual([{ id: "q1", kind: "command", tool: "bash", input: { command: "bun test" }, thread_id: null, status: "pending" }]);

    const again = rig();
    ed = again.ed;
    again.s.restore(saved);
    const [card] = again.s.cards;
    expect(card.status).toBe("expired");
    expect(again.s.saved().approvals[0].status).toBe("expired");
    await again.s.decideCard(card, "accept");
    // It could not run: nothing is answered and no undo point is taken; pair is asked again instead.
    expect(again.responses).toEqual([]);
    expect(again.checkpoints).toEqual([]);
    expect(again.sent[0]).toContain("Earlier you asked to run `bun test`, but pair closed before I answered");
    expect(again.s.cards).toEqual([]);

    const third = rig();
    third.s.restore(saved);
    third.ed.destroy();
    await third.s.decideCard(third.s.cards[0], "reject");
    expect(third.s.cards).toEqual([]);
    expect(third.sent).toEqual([]);
    expect(third.s.saved().approvals).toEqual([]);
  });

  test("asking again about an expired card asks in its thread, about its passage", async () => {
    const r = rig();
    ed = r.ed;
    r.note.sidecar.threads = [thread("t1")];
    r.s.restore({ proposals: [], approvals: [{ id: "q1", kind: "file_edit", tool: "edit", input: { path: "src/a.ts" }, thread_id: "t1", status: "pending" }] });
    await r.s.decideCard(r.s.cards[0], "accept");
    expect(r.sent[0]).toMatch(/^<pair mode="thread"\/>/);
    expect(r.sent[0]).toContain("Earlier you asked to edit src/a.ts");
    expect(r.s.workingOn("t1")).toBe(true);
  });

  test("a reload keeps the agent waiting on proposals that still fit, and declines the rest", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
    await r.s.onRecord(ui("q2", "note_edit", { find: "recursively", replace: "iteratively" }));
    const pending = r.s.takeProposals();
    // Changed outside pair: a line added above, and the Think paragraph rewritten.
    r.ed.commands.setContent("# N\n\nIntro.\n\n## Think\n\nSum prices one by one.\n\n## Build\n\nUse a loop.\n", { contentType: "markdown" } as never);
    expect(r.s.reapply(pending)).toBe(1);
    expect(r.responses).toEqual([["q2", { decision: "decline", reason: expect.stringContaining("changed outside pair") }]]);
    const [g] = suggestionGroups(r.ed.state.doc);
    expect(g.ins).toBe("Use a for loop");
    await r.s.onSuggestionDecided(g.id, "accept");
    expect(r.responses[1]).toEqual(["q1", { decision: "accept" }]);
  });

  test("a diagram and an edit on the same passage both come back under it", async () => {
    const r = rig();
    ed = r.ed;
    const quote = { exact: "Sum prices recursively.", prefix: "## Think\n", suffix: "\n## Build" };
    await r.s.ask("visualize", { selection: { text: quote.exact, quote } });
    await r.s.onRecord({ type: "pair_started" });
    await r.s.onRecord(ui("q1", "diagram", { spec: { v: 1 } }));
    await r.s.onRecord(ui("q2", "note_edit", { find: "recursively", replace: "iteratively" }));
    const saved = r.s.saved();
    saved.proposals.reverse(); // the edit first: its new words must not hide the diagram's passage
    const md = markdownOf(r.ed);

    const again = rig();
    again.ed.commands.setContent(md, { contentType: "markdown" } as never);
    ed = again.ed;
    expect(again.s.restore(saved)).toBe(0);
    const names = again.ed.state.doc.content.content.map((n) => n.type.name);
    const think = again.ed.state.doc.content.content.findIndex((n) => n.textContent.startsWith("Sum prices"));
    expect(names[think + 1]).toBe("pairDiagram");
    expect(suggestionGroups(again.ed.state.doc).find((g) => !g.block)?.ins).toBe("iteratively");
  });

  test("an edit right next to a pending block both come back, and each answers on its own", async () => {
    const r = rig();
    ed = r.ed;
    const quote = { exact: "Sum prices recursively.", prefix: "## Think\n", suffix: "\n## Build" };
    await r.s.ask("visualize", { selection: { text: quote.exact, quote } });
    await r.s.onRecord({ type: "pair_started" });
    await r.s.onRecord(ui("q1", "note_edit", { find: "recursively.", replace: "in a loop." }));
    await r.s.onRecord(ui("q2", "diagram", { spec: { v: 1 } }));
    const saved = r.s.saved();
    expect(saved.proposals).toHaveLength(2);
    const md = markdownOf(r.ed);

    const again = rig();
    again.ed.commands.setContent(md, { contentType: "markdown" } as never);
    ed = again.ed;
    expect(again.s.restore(saved)).toBe(0);
    const groups = suggestionGroups(again.ed.state.doc);
    expect(groups.map((g) => (g.block ? "block" : g.ins))).toEqual(["in a loop.", "block"]);
    accept(again.ed, groups[0].id);
    again.s.onSuggestionDecided(groups[0].id, "accept");
    expect(suggestionGroups(again.ed.state.doc).map((g) => g.block)).toEqual([true]);
    expect(markdownOf(again.ed)).toContain("Sum prices in a loop.");
    expect(markdownOf(again.ed)).not.toContain("pair-diagram");
  });

  test("an agent waiting on a suggestion Kevin deleted is told, and the edit is no longer saved", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
    const [g] = suggestionGroups(r.ed.state.doc);
    const para = r.ed.state.doc.resolve(g.from);
    r.ed.view.dispatch(r.ed.state.tr.delete(para.before(), para.after()));
    expect(r.s.saved().proposals).toEqual([]);
    expect(r.responses).toEqual([["q1", { decision: "decline", reason: expect.stringContaining("removed") }]]);
  });

  test("an edit whose struck text Kevin deleted keeps its saved anchor while its new words remain", async () => {
    const r = rig();
    ed = r.ed;
    await r.s.onRecord(ui("q1", "note_edit", { find: "Use a loop", replace: "Use a for loop" }));
    const first = r.s.saved().proposals[0].anchor;
    const g = suggestionGroups(r.ed.state.doc)[0];
    // Remove only the struck-through (deletion-marked) text.
    const del: [number, number][] = [];
    r.ed.state.doc.nodesBetween(g.from, g.to, (n, pos) => {
      if (n.isText && n.marks.some((m) => m.type.name === "deletion")) del.push([pos, pos + n.nodeSize]);
    });
    const tr = r.ed.state.tr;
    for (const [a, b] of del.reverse()) tr.delete(a, b);
    r.ed.view.dispatch(tr);
    expect(suggestionGroups(r.ed.state.doc)).toHaveLength(1);
    expect(r.s.saved().proposals.map((p) => p.anchor)).toEqual([first]);
    expect(r.responses).toEqual([]);
  });

  test("a card whose thread is gone shows at the end of the note", () => {
    const r = rig();
    ed = r.ed;
    r.note.sidecar.threads = [{ ...thread("t1"), resolved: true }];
    r.s.restore({ proposals: [], approvals: [
      { id: "a", kind: "command", tool: "bash", input: {}, thread_id: "t1", status: "pending" },
      { id: "b", kind: "command", tool: "bash", input: {}, thread_id: "gone", status: "pending" },
      { id: "c", kind: "command", tool: "bash", input: {}, thread_id: null, status: "pending" },
    ] });
    expect(r.s.unthreadedCards().map((c) => c.requestId)).toEqual(["a", "b", "c"]);
  });
});
