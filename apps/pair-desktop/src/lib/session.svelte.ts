/**
 * One note's conversation with its agent: what is running, what waits for Kevin, and where each
 * answer goes. Every ask about a passage has a thread, and everything pair does for that ask (its
 * live status, its answer, its approval cards) shows under that passage. The app wires
 * `transport` to Tauri; tests pass a fake.
 */
import type { Editor } from "@tiptap/core";
import type { Approval, Note, Proposal, Sidecar, Thread, TextQuote } from "$lib/api";
import { buildPrompt, type AskKind } from "$lib/prompts";
import { markdownOf, proposalAnchors, proposeBlock, proposeEdit, restoreProposal, threadForQuote } from "$lib/editor/note";
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

/**
 * A file edit, command, outside read or unknown tool waiting for Kevin, shown under its passage.
 * "expired": it was saved with the note, but the agent that asked is gone, so it cannot run.
 */
export type Card = {
  requestId: string;
  kind: "file_edit" | "command" | "read_outside" | "tool";
  tool: string;
  input: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "expired";
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

/** What Kevin would be approving, in a few words for a prompt. */
function describeCard(card: Card): string {
  const path = String(card.input.path ?? "").replace(/^@/, "");
  switch (card.kind) {
    case "command":
      return `run \`${String(card.input.command ?? "")}\``;
    case "file_edit":
      return `${card.tool === "write" ? "write" : "edit"} ${path}`;
    case "read_outside":
      return `read ${path}`;
    default:
      return `use ${card.tool}`;
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

  /**
   * Pending suggestions (note edits, diagrams, replies) by suggestion id. A proposal with a
   * request id has the agent waiting on Kevin's answer.
   */
  private proposals = new Map<number, Proposal>();
  private pendingTasks: TaskCtx[] = [];
  private current: TaskCtx | null = null;
  private lastTask: TaskCtx | null = null;

  constructor(
    private transport: Transport,
    private editor: () => Editor | null,
    private note: () => Note,
    private onThreads: (update: (threads: Thread[]) => Thread[]) => void,
    private context: () => Context = () => ({}),
    /** Proposals or approvals changed: save the sidecar (it reads them with `saved()`). */
    private onPending: () => void = () => {},
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
        const replace = p.replace ?? "";
        const r = proposeEdit(ed, p.find ?? "", replace);
        if ("error" in r) return answer({ decision: "decline", reason: r.error });
        return this.keep(r.id, { kind: "edit", replace }, requestId);
      }
      case "diagram": {
        const spec = JSON.stringify(p.spec, null, 0);
        const id = proposeBlock(ed, "pairDiagram", { spec }, this.current?.quote);
        if (id === null) return answer({ decision: "decline", reason: "Could not place the diagram." });
        return this.keep(id, { kind: "diagram", spec }, requestId);
      }
      case "verdict": {
        const text = `${p.ready ? "Ready" : "Not ready"}: ${p.summary}`;
        const id = proposeBlock(ed, "pairReply", { text }, this.endOfNote());
        if (id === null) return answer({ decision: "decline", reason: "The end of the note has a suggestion Kevin has not answered; give the verdict again after he does." });
        return this.keep(id, { kind: "reply", text }, requestId);
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
        this.onPending();
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

  private keep(id: number, what: Pick<Proposal, "kind" | "replace" | "spec" | "text">, requestId: string) {
    this.proposals.set(id, { id: crypto.randomUUID(), ...what, anchor: null, thread_id: this.current?.threadId ?? null, request_id: requestId });
    this.onPending();
  }

  /** Kevin answered an inline suggestion (note edit, diagram, reply) in the editor. */
  async onSuggestionDecided(id: number, decision: "accept" | "reject", reason?: string) {
    const p = this.proposals.get(id);
    if (!p) return;
    this.proposals.delete(id);
    this.onPending();
    // A proposal restored from disk has no agent waiting; the decision only changes the note.
    if (p.request_id) await this.transport.respond(p.request_id, JSON.stringify(decision === "accept" ? { decision: "accept" } : { decision: "decline", reason }));
  }

  /**
   * Kevin answered a file/command card. Accepting takes an undo point first. An expired card
   * cannot run: accepting asks pair to request it again, rejecting dismisses it.
   */
  async decideCard(card: Card, decision: "accept" | "reject", opts: { reason?: string; command?: string } = {}) {
    if (card.status === "expired") return this.settleExpired(card, decision);
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
      this.onPending();
      await this.transport.respond(card.requestId, JSON.stringify({ decision: "accept", command: opts.command }));
    } else {
      card.status = "rejected";
      card.reason = opts.reason;
      this.onPending();
      await this.transport.respond(card.requestId, JSON.stringify({ decision: "decline", reason: opts.reason }));
    }
    if (this.activity?.status === "waiting for you") this.activity.status = "thinking";
  }

  private async settleExpired(card: Card, decision: "accept" | "reject") {
    this.cards = this.cards.filter((c) => c !== card);
    this.onPending();
    if (decision === "reject") return;
    const t = card.threadId ? this.note().sidecar.threads.find((x) => x.id === card.threadId && !x.resolved) : undefined;
    const request = `Earlier you asked to ${describeCard(card)}, but pair closed before I answered, so it never ran. Ask for it again if it is still needed.`;
    await this.ask("ask", t ? { request, threadId: t.id, selection: { text: t.anchor.quote.exact, quote: t.anchor.quote } } : { request });
  }

  /** Cards with no open thread to sit under: they are listed at the end of the note. */
  unthreadedCards(): Card[] {
    const open = new Set(this.note().sidecar.threads.filter((t) => !t.resolved).map((t) => t.id));
    return this.cards.filter((c) => c.threadId === null || !open.has(c.threadId));
  }

  /** Pending proposals and approvals as the sidecar saves them, anchored where they sit now. */
  saved(): Pick<Sidecar, "proposals" | "approvals"> {
    const ed = this.editor();
    const anchors = ed ? proposalAnchors(ed) : null;
    const proposals: Proposal[] = [];
    for (const [id, p] of this.proposals) {
      if (anchors && !anchors.has(id)) {
        // Kevin deleted the text it sat in: nothing is left to accept, so let a waiting agent go.
        this.proposals.delete(id);
        if (p.request_id) void this.transport.respond(p.request_id, JSON.stringify({ decision: "decline", reason: "Kevin removed the passage your suggestion was in, so it was dropped. Re-read the note." }));
        continue;
      }
      const anchor = anchors?.get(id);
      if (anchor !== undefined) p.anchor = anchor;
      proposals.push({ ...p });
    }
    const approvals: Approval[] = this.cards
      .filter((c): c is Card & { status: Approval["status"] } => c.status === "pending" || c.status === "expired")
      .map((c) => ({ id: c.requestId, kind: c.kind, tool: c.tool, input: c.input, thread_id: c.threadId, status: c.status }));
    return { proposals, approvals };
  }

  /**
   * Brings back what the sidecar saved when the note opens. No agent is waiting on any of it any
   * more: proposals come back as suggestions whose answer only changes the note, approvals as
   * expired cards. Returns how many proposals no longer fit the note.
   */
  restore(sidecar: Pick<Sidecar, "proposals" | "approvals">): number {
    this.cards = (sidecar.approvals ?? []).map((a) => ({ requestId: a.id, kind: a.kind, tool: a.tool, input: a.input ?? {}, status: "expired", threadId: a.thread_id }));
    return this.reapply((sidecar.proposals ?? []).map((p) => ({ ...p, request_id: null })));
  }

  /** Takes the pending proposals out before the note's text is replaced; give them to `reapply`. */
  takeProposals(): Proposal[] {
    const { proposals } = this.saved();
    this.proposals.clear();
    return proposals;
  }

  /**
   * Re-applies proposals to the note. One whose passage is gone is dropped, and an agent waiting
   * on it is told so. Returns how many were dropped.
   */
  reapply(proposals: Proposal[]): number {
    const ed = this.editor();
    let lost = 0;
    // Blocks first: they add no text, so they cannot shift the passage another proposal quotes.
    const ordered = [...proposals.filter((p) => p.kind !== "edit"), ...proposals.filter((p) => p.kind === "edit")];
    for (const p of ordered) {
      const id = ed ? restoreProposal(ed, p) : null;
      if (id !== null) {
        this.proposals.set(id, p);
        continue;
      }
      lost++;
      if (p.request_id) void this.transport.respond(p.request_id, JSON.stringify({ decision: "decline", reason: "The passage your suggestion was about changed outside pair, so it was dropped. Re-read the note." }));
    }
    if (proposals.length) this.onPending();
    return lost;
  }
}
