/**
 * One note's conversation with its agent: what is running, what waits for Kevin, and where each
 * answer goes. Every ask about a passage has a thread, and everything pair does for that ask (its
 * live status, its answer, its approval cards) shows under that passage. The app wires
 * `transport` to Tauri; tests pass a fake.
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

/** What the prompt needs to know about the project beyond the note. */
export type Context = { folder?: string; files?: string[]; openFile?: string | null };

export type Answer = { decision: "accept" | "decline"; reason?: string; command?: string; note?: string };

/** A file edit, command, outside read or unknown tool waiting for Kevin, shown under its passage. */
export type Card = {
  requestId: string;
  kind: "file_edit" | "command" | "read_outside" | "tool";
  tool: string;
  input: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  reason?: string;
  checkpoint?: number | null;
  /** The thread this card belongs to; null shows it at the end of the note. */
  threadId: string | null;
};

/** What pair is doing right now, and where: a thread, or the note as a whole. */
export type Activity = { threadId: string | null; status: string; text: string };

type TaskCtx = { kind: AskKind; message: string; threadId?: string; quote?: TextQuote; display: string };

/** Plain words for a tool call, for the line under the passage while pair works. */
export function describeTool(name: string, args: Record<string, any> = {}): string {
  const path = typeof args.path === "string" ? args.path.replace(/^@/, "") : "";
  switch (name) {
    case "read":
      return path ? `reading ${path}` : "reading";
    case "grep":
      return args.pattern ? `searching for “${String(args.pattern).slice(0, 40)}”` : "searching";
    case "find":
    case "ls":
      return path && path !== "." ? `looking through ${path}` : "looking through the project";
    case "bash":
      return "asking to run a command";
    case "edit":
    case "write":
      return path ? `changing ${path}` : "changing a file";
    case "add_diagram":
      return "drawing";
    case "suggest_note_edit":
      return "suggesting an edit to the note";
    case "add_thread":
      return "writing a note";
    case "review_verdict":
      return "writing the verdict";
    default:
      return `using ${name}`;
  }
}

export class NoteSession {
  running = $state(false);
  queued = $state(0);
  activity = $state<Activity | null>(null);
  cards = $state<Card[]>([]);
  /** Answers with no passage to sit under (a retry after a restart). */
  loose = $state<string[]>([]);
  stageSuggestion = $state<{ stage: string; why: string } | null>(null);
  crash = $state<{ stderr: string; code: number | null } | null>(null);
  error = $state<string | null>(null);

  /** Suggestion ids (note edits, diagrams, replies) the agent is waiting on → request id. */
  private waiting = new Map<number, { requestId: string }>();
  private pendingTasks: TaskCtx[] = [];
  private current: TaskCtx | null = null;
  private lastTask: TaskCtx | null = null;

  constructor(
    private transport: Transport,
    private editor: () => Editor | null,
    private note: () => Note,
    private onThreads: (update: (threads: Thread[]) => Thread[]) => void,
    private context: () => Context = () => ({}),
  ) {}

  /**
   * Sends an ask. `selection` is the passage it is about; `threadId` is the thread its answer,
   * status and cards appear in (the caller creates it).
   */
  async ask(kind: AskKind, opts: { request?: string; selection?: { text: string; quote: TextQuote }; threadId?: string } = {}) {
    const ed = this.editor();
    const note = this.note();
    if (!ed) return;
    this.crash = null;
    this.error = null;
    const message = buildPrompt({
      kind,
      stage: note.sidecar.stage,
      tell: note.sidecar.tell,
      note: markdownOf(ed),
      noteName: note.name,
      ...this.context(),
      selection: opts.selection?.text,
      request: opts.request,
    });
    const ctx: TaskCtx = { kind, message, threadId: opts.threadId, quote: opts.selection?.quote, display: opts.request ?? opts.selection?.text ?? "" };
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
    if (this.lastTask) void this.ask("retry", { request: this.lastTask.display, threadId: this.lastTask.threadId });
  }

  async stop() {
    this.pendingTasks = [];
    this.queued = 0;
    await this.transport.stop();
  }

  /** Is pair working on this thread right now (or queued for it)? */
  workingOn(threadId: string): boolean {
    return this.activity?.threadId === threadId || this.pendingTasks.some((t) => t.threadId === threadId);
  }

  /** Feeds one record from the agent (Pi's records plus pair's lifecycle records). */
  async onRecord(rec: Record<string, any>) {
    switch (rec.type) {
      case "pair_started": {
        this.running = true;
        this.current = this.pendingTasks.shift() ?? { kind: "retry", message: rec.message, display: "" };
        this.lastTask = this.current;
        this.queued = this.pendingTasks.length;
        this.activity = { threadId: this.current.threadId ?? null, status: "thinking", text: "" };
        break;
      }
      case "pair_queued":
        this.queued = rec.queued ?? this.queued;
        break;
      case "tool_execution_start": {
        if (this.activity) this.activity.status = describeTool(rec.toolName ?? rec.tool ?? "tool", rec.args ?? rec.input ?? {});
        break;
      }
      case "message_update": {
        const ev = rec.assistantMessageEvent;
        if (ev?.type === "text_delta" && this.activity) {
          this.activity.text += ev.delta;
          this.activity.status = "writing";
        }
        break;
      }
      case "message_end": {
        // Provider failures (usage limits, auth, network) end the message with an error.
        const m = rec.message;
        if (m?.role === "assistant" && m.stopReason === "error") this.error = `The model stopped: ${m.errorMessage ?? "unknown error"}`;
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

  private finishTask() {
    const ctx = this.current;
    const text = (this.activity?.text ?? "").trim();
    this.running = false;
    this.current = null;
    this.activity = null;
    if (!ctx) return;
    const id = ctx.threadId;
    if (id) {
      // The answer joins its thread; a thread that never got a message (e.g. a riddle with no
      // nudge) is dropped so no empty hook is left under the passage.
      this.onThreads((ts) =>
        ts
          .map((t) => (t.id === id && text ? { ...t, messages: [...t.messages, { author: "agent", text }] } : t))
          .filter((t) => t.id !== id || t.messages.length > 0 || this.cards.some((c) => c.threadId === id)),
      );
    } else if (text && ctx.kind !== "passive") {
      this.loose.push(text);
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
        if (id === null) return answer({ decision: "decline", reason: "The end of the note has a suggestion Kevin has not answered; give the verdict again after he does." });
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
        this.cards.push({ requestId, kind, tool: p.tool, input: p.input ?? {}, status: "pending", threadId: this.current?.threadId ?? null });
        if (this.activity) this.activity.status = "waiting for you";
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
    if (this.activity?.status === "waiting for you") this.activity.status = "thinking";
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
