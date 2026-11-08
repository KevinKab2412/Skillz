/**
 * One note's conversation with its agent: what is running, what waits for Kevin, and where each
 * answer goes. The app wires `transport` to Tauri; tests pass a fake.
 */
import type { Editor } from "@tiptap/core";
import type { Note, Thread, TextQuote } from "$lib/api";
import { buildPrompt, type AskKind } from "$lib/prompts";
import { markdownOf, proposeBlock, proposeEdit, threadForQuote } from "$lib/editor/note";
import { quoteAt, textIndex } from "$lib/editor/anchors";

export type Transport = {
  ask(message: string): Promise<"started" | "queued">;
  stop(): Promise<void>;
  respond(requestId: string, value: string | null): Promise<void>;
  checkpoint(label: string): Promise<{ n: number } | null>;
};

export type Answer = { decision: "accept" | "decline"; reason?: string; command?: string; note?: string };

/** A file edit, command, outside read or unknown tool waiting for Kevin. */
export type Card = {
  requestId: string;
  kind: "file_edit" | "command" | "read_outside" | "tool";
  tool: string;
  input: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  reason?: string;
  checkpoint?: number | null;
};

export type ChatItem =
  | { type: "kevin"; text: string }
  | { type: "agent"; text: string; done: boolean; kind: AskKind }
  | { type: "card"; card: Card }
  | { type: "notice"; text: string };

type TaskCtx = { kind: AskKind; message: string; threadId?: string; quote?: TextQuote; display: string };

export class NoteSession {
  running = $state(false);
  queued = $state(0);
  chat = $state<ChatItem[]>([]);
  stageSuggestion = $state<{ stage: string; why: string } | null>(null);
  crash = $state<{ stderr: string; code: number | null } | null>(null);
  error = $state<string | null>(null);

  /** Suggestion ids (note edits, diagrams, replies) the agent is waiting on → request id. */
  private waiting = new Map<number, { requestId: string; onAccept?: () => void }>();
  private pendingTasks: TaskCtx[] = [];
  private current: TaskCtx | null = null;
  private lastTask: TaskCtx | null = null;

  constructor(
    private transport: Transport,
    private editor: () => Editor | null,
    private note: () => Note,
    private onThreads: (update: (threads: Thread[]) => Thread[]) => void,
  ) {}

  /** Sends an ask. `selection` is the passage it is about (with its quote, to place results). */
  async ask(kind: AskKind, opts: { request?: string; selection?: { text: string; quote: TextQuote }; threadId?: string } = {}) {
    const ed = this.editor();
    const note = this.note();
    if (!ed) return;
    this.crash = null;
    const message = buildPrompt({
      kind,
      stage: note.sidecar.stage,
      tell: note.sidecar.tell,
      note: markdownOf(ed),
      noteName: note.name,
      selection: opts.selection?.text,
      request: opts.request,
    });
    const ctx: TaskCtx = { kind, message, threadId: opts.threadId, quote: opts.selection?.quote, display: opts.request ?? opts.selection?.text ?? "" };
    if (kind === "chat" || kind === "doit") this.chat.push({ type: "kevin", text: kind === "doit" ? `Do it: ${ctx.display}` : ctx.display });
    this.pendingTasks.push(ctx);
    try {
      const r = await this.transport.ask(message);
      if (r === "queued") this.queued = this.pendingTasks.length - (this.running ? 0 : 1);
    } catch (e) {
      this.pendingTasks = this.pendingTasks.filter((t) => t !== ctx);
      this.error = String(e);
    }
  }

  retryLast() {
    if (this.lastTask) void this.ask("retry", { request: this.lastTask.display });
  }

  async stop() {
    this.pendingTasks = [];
    this.queued = 0;
    await this.transport.stop();
  }

  /** Feeds one record from the agent (Pi's records plus pair's lifecycle records). */
  async onRecord(rec: Record<string, any>) {
    switch (rec.type) {
      case "pair_started": {
        this.running = true;
        this.current = this.pendingTasks.shift() ?? { kind: "chat", message: rec.message, display: "" };
        this.lastTask = this.current;
        this.queued = this.pendingTasks.length;
        if (this.showsInChat(this.current.kind)) this.chat.push({ type: "agent", text: "", done: false, kind: this.current.kind });
        break;
      }
      case "pair_queued":
        this.queued = rec.queued ?? this.queued;
        break;
      case "message_update": {
        const ev = rec.assistantMessageEvent;
        if (ev?.type === "text_delta") this.appendText(ev.delta);
        break;
      }
      case "pair_settled":
        this.finishTask();
        break;
      case "pair_exited":
        if (rec.during_task || (rec.code && rec.code !== 0)) this.crash = { stderr: rec.stderr ?? "", code: rec.code ?? null };
        break;
      case "pair_error":
        this.error = rec.error;
        break;
      case "extension_ui_request":
        if (rec.method === "editor" && typeof rec.title === "string" && rec.title.startsWith("pair:")) {
          await this.onRequest(rec.id, rec.title.slice(5), JSON.parse(rec.prefill ?? "{}"));
        } else if (rec.method === "editor" || rec.method === "select" || rec.method === "confirm" || rec.method === "input") {
          await this.transport.respond(rec.id, null);
        }
        break;
    }
  }

  private showsInChat(kind: AskKind) {
    return kind === "chat" || kind === "doit" || kind === "retry" || kind === "visualize";
  }

  private appendText(delta: string) {
    if (!this.current) return;
    const open = this.showsInChat(this.current.kind) ? this.chat.findLast((c) => c.type === "agent" && !c.done) : undefined;
    if (open?.type === "agent") open.text += delta;
    else this.currentText += delta;
  }

  private currentText = "";

  private finishTask() {
    const ctx = this.current;
    const text = this.currentText.trim();
    this.currentText = "";
    this.running = false;
    this.current = null;
    for (const item of this.chat) if (item.type === "agent") item.done = true;
    if (!ctx || !text) return;
    if (ctx.kind === "ask" && ctx.threadId) {
      const id = ctx.threadId;
      this.onThreads((ts) => ts.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { author: "agent", text }] } : t)));
    } else if (ctx.kind === "inline") {
      const ed = this.editor();
      if (ed) proposeBlock(ed, "pairReply", { text }, ctx.quote);
    }
  }

  private async onRequest(requestId: string, kind: string, p: Record<string, any>) {
    const ed = this.editor();
    const answer = (a: Answer) => this.transport.respond(requestId, JSON.stringify(a));
    if (!ed) return answer({ decision: "decline", reason: "The note is not open." });

    switch (kind) {
      case "thread": {
        if (p.thread_id) {
          let found = false;
          this.onThreads((ts) =>
            ts.map((t) => {
              if (t.id !== p.thread_id) return t;
              found = true;
              return { ...t, messages: [...t.messages, { author: "agent", text: p.text }] };
            }),
          );
          return answer(found ? { decision: "accept" } : { decision: "decline", reason: `No thread ${p.thread_id}.` });
        }
        const t = threadForQuote(ed, crypto.randomUUID(), p.quote ?? {}, p.text ?? "");
        if (!t) return answer({ decision: "decline", reason: "That passage is not in the note; quote it exactly." });
        this.onThreads((ts) => [...ts, t]);
        return answer({ decision: "accept", note: `thread_id ${t.id}` });
      }
      case "note_edit": {
        const r = proposeEdit(ed, p.find ?? "", p.replace ?? "");
        if ("error" in r) return answer({ decision: "decline", reason: r.error });
        this.waiting.set(r.id, { requestId });
        return;
      }
      case "diagram": {
        const quote = this.current?.quote;
        const id = proposeBlock(ed, "pairDiagram", { spec: JSON.stringify(p.spec, null, 0) }, quote);
        if (id === null) return answer({ decision: "decline", reason: "Could not place the diagram." });
        this.waiting.set(id, { requestId });
        return;
      }
      case "verdict": {
        const text = `${p.ready ? "Ready" : "Not ready"}: ${p.summary}`;
        const id = proposeBlock(ed, "pairReply", { text }, this.endOfNote());
        if (id === null) return answer({ decision: "accept" });
        this.waiting.set(id, { requestId });
        return;
      }
      case "stage":
        this.stageSuggestion = { stage: p.stage, why: p.why };
        return answer({ decision: "accept" });
      case "file_edit":
      case "command":
      case "read_outside":
      case "tool": {
        const card: Card = { requestId, kind, tool: p.tool, input: p.input ?? {}, status: "pending" };
        this.chat.push({ type: "card", card });
        return;
      }
      default:
        return answer({ decision: "decline", reason: `pair does not handle ${kind}.` });
    }
  }

  private endOfNote(): TextQuote | undefined {
    const ed = this.editor();
    if (!ed) return undefined;
    const ix = textIndex(ed.state.doc);
    const end = ix.text.length;
    const start = Math.max(0, ix.text.lastIndexOf("\n", end - 2) + 1);
    return end > start ? quoteAt(ix.text, start, end) : undefined;
  }

  /** Kevin answered an inline suggestion (note edit, diagram, reply) in the editor. */
  async onSuggestionDecided(id: number, decision: "accept" | "reject", reason?: string) {
    const w = this.waiting.get(id);
    if (!w) return;
    this.waiting.delete(id);
    await this.transport.respond(w.requestId, JSON.stringify(decision === "accept" ? { decision: "accept" } : { decision: "decline", reason }));
  }

  /** Kevin answered a file/command card. Accepting takes an undo point first. */
  async decideCard(card: Card, decision: "accept" | "reject", opts: { reason?: string; command?: string } = {}) {
    if (card.status !== "pending") return;
    if (decision === "accept") {
      if (card.kind === "file_edit" || card.kind === "command") {
        const what = card.kind === "command" ? `run: ${opts.command ?? card.input.command}` : `${card.tool} ${card.input.path}`;
        try {
          card.checkpoint = (await this.transport.checkpoint(what))?.n ?? null;
        } catch {
          return; // Kevin backed out when no undo point could be saved; the card stays pending.
        }
      }
      card.status = "accepted";
      await this.transport.respond(card.requestId, JSON.stringify({ decision: "accept", command: opts.command }));
    } else {
      card.status = "rejected";
      card.reason = opts.reason;
      await this.transport.respond(card.requestId, JSON.stringify({ decision: "decline", reason: opts.reason }));
    }
  }

  /** Answers every suggestion the agent is waiting on with a decline (the note was reloaded). */
  async declineAllSuggestions(reason: string) {
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of waiting) await this.transport.respond(w.requestId, JSON.stringify({ decision: "decline", reason }));
  }

  /** Suggestions Kevin has not answered yet (dropped when the note closes). */
  pendingSuggestionIds(): number[] {
    return [...this.waiting.keys()];
  }
}
