<script lang="ts">
  import { mount, onDestroy, onMount, unmount, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import { createEditor, EditorContent, type Editor } from "svelte-tiptap";
  import { listen } from "@tauri-apps/api/event";
  import { agent, api, noteKey, type AgentEvent, type Checkpoint, type Note, type PiStatus, type Settings, type Stage, type Thread } from "$lib/api";
  import { STAGES } from "$lib/prompts";
  import { NoteSession } from "$lib/session.svelte";
  import {
    accept,
    editorOptions,
    liveAnchors,
    markdownOf,
    refreshQuotes,
    reject,
    selectedText,
    setActiveThread,
    setThreads,
    threadForSelection,
  } from "$lib/editor/note";
  import { suggestionGroups, widgetPlacements } from "$lib/editor/extensions";
  import { quoteAt, textIndex } from "$lib/editor/anchors";
  import Exchange from "./Exchange.svelte";
  import CardView from "./CardView.svelte";
  import type { ExchangeCtx } from "./exchange";
  import type { AskKind } from "$lib/prompts";
  import { exportMarkdown, exportPdf } from "$lib/export";
  import { focusOnMount } from "$lib/focus";

  let {
    folder,
    note = $bindable(),
    settings,
    pi,
    interrupted = null,
    files = [],
    openFile = null,
    onFilesChanged = () => {},
  }: {
    folder: string;
    note: Note;
    settings: Settings;
    pi: PiStatus | null;
    interrupted?: string | null;
    files?: string[];
    openFile?: string | null;
    onFilesChanged?: () => void;
  } = $props();

  let editor = $state<Readable<Editor>>();
  let column: HTMLDivElement;
  let scroller: HTMLDivElement;
  let page: HTMLDivElement;
  let active = $state<string | null>(null);
  /** Pending text suggestions by id, for their Accept / Reject bars under the passage. */
  let suggestions = $state<Record<number, { ins: string; del: string }>>({});
  /** Threads whose passage is gone; they are listed at the end of the note. */
  let detachedIds = $state<string[]>([]);
  let menu = $state<{ x: number; y: number; asking: boolean; question: string } | null>(null);
  let models = $state<string[]>([]);
  let checkpoints = $state<Checkpoint[] | null>(null);
  // Per-note copies that start from the app settings and the restart check.
  // svelte-ignore state_referenced_locally
  let thinks = $state(settings.thinks_with_you);
  // svelte-ignore state_referenced_locally
  let interruptedMsg = $state<string | null>(interrupted);
  let notice = $state<string | null>(null);
  let exporting = $state(false);
  let justMyWords = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = note.markdown;
  const seen = new Set<string>();

  const ed = () => (editor ? $editor ?? null : null);

  const session = new NoteSession(
    {
      ask: async (message) => {
        if (!note.sidecar.session.id) {
          note.sidecar.session.id = crypto.randomUUID();
          await saveSidecar();
        }
        return agent.ask(folder, note.name, note.sidecar.session.id!, note.sidecar.model ?? settings.default_model, message);
      },
      stop: () => agent.stop(folder, note.name),
      respond: (id, value) =>
        agent.send(folder, note.name, value === null ? { type: "extension_ui_response", id, cancelled: true } : { type: "extension_ui_response", id, value }),
      checkpoint: async (label) => {
        try {
          return await agent.checkpoint(folder, note.name, label);
        } catch (e) {
          // Without an undo point the change cannot be rolled back: make Kevin say yes twice.
          const ok = confirm(`pair could not save an undo point (${String(e)}). This change could not be undone from pair. Go ahead anyway?`);
          if (!ok) throw new Error("no undo point");
          return null;
        }
      },
    },
    ed,
    () => note,
    (update) => {
      note.sidecar.threads = update(note.sidecar.threads);
      const e = ed();
      if (e) setThreads(e, note.sidecar.threads);
      void saveSidecar();
    },
    () => ({ folder, files, openFile }),
  );

  const ctx: ExchangeCtx = {
    session,
    thread: (id) => note.sidecar.threads.find((t) => t.id === id && !t.resolved),
    suggestion: (id) => suggestions[id],
    active: () => active,
    activate: (id) => (active = id),
    reply: (t, text) => void replyInThread(t, text),
    resolve: (t) => void resolveThread(t),
    decideCard: (card, decision, opts) => void session.decideCard(card, decision, opts),
  };

  /** Each widget under a passage is a Svelte component mounted once into a cached element. */
  const hosts = new Map<string, { el: HTMLElement; inst: Record<string, unknown> }>();
  function host(key: string): HTMLElement {
    const have = hosts.get(key);
    if (have) return have.el;
    const el = document.createElement("div");
    el.className = "pair-widget";
    el.contentEditable = "false";
    const inst = mount(Exchange, { target: el, props: { wkey: key, ctx } });
    hosts.set(key, { el, inst });
    return el;
  }

  async function saveSidecar() {
    await api.saveSidecar(folder, note.name, $state.snapshot(note.sidecar) as Note["sidecar"]).catch((e) => (notice = String(e)));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  let saving: Promise<void> = Promise.resolve();
  let writing = "";

  /** Saves are serialised, and refused when the file changed on disk since we last wrote it. */
  function save(): Promise<void> {
    clearTimeout(saveTimer);
    saving = saving.then(async () => {
      const e = ed();
      if (!e) return;
      const markdown = markdownOf(e);
      if (markdown === lastSaved) return;
      note.sidecar.threads = refreshQuotes(e, note.sidecar.threads);
      note.markdown = markdown;
      const expected = lastSaved;
      // Mark this text as ours before writing, so the watcher's echo is not taken for an outside edit.
      writing = markdown;
      try {
        await api.saveNote(folder, $state.snapshot(note) as Note, expected);
        lastSaved = markdown;
      } catch (err) {
        if (String(err).includes("changed on disk")) {
          const disk = await api.openNote(folder, note.name).catch(() => null);
          if (disk) reloadFromDisk(disk, "The note changed on disk before your last edit was saved; it was reloaded. Re-type anything missing.");
        } else notice = String(err);
      }
    });
    return saving;
  }

  /** Called by the page when the file changed on disk. */
  export function reloadFromDisk(fresh: Note, message = "The note changed on disk and was reloaded. Pending suggestions were dropped.") {
    const e = ed();
    if (!e || fresh.markdown === lastSaved || fresh.markdown === writing) return;
    // Pending suggestions disappear with the reload: tell the agent, so it is not left waiting.
    void session.declineAllSuggestions("The note was reloaded from disk, so your suggestion was dropped. Re-read the note.");
    lastSaved = fresh.markdown;
    note.markdown = fresh.markdown;
    note.sidecar = fresh.sidecar;
    e.commands.setContent(fresh.markdown, { contentType: "markdown", emitUpdate: false } as never);
    setThreads(e, note.sidecar.threads);
    notice = message;
  }

  let raf = 0;
  function relayout() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const e = ed();
      if (!e || e.isDestroyed || !e.view.dom.isConnected) return;
      const next: Record<number, { ins: string; del: string }> = {};
      for (const g of suggestionGroups(e.state.doc)) if (!g.block) next[g.id] = { ins: g.ins, del: g.del };
      suggestions = next;
      detachedIds = liveAnchors(e).filter((a) => a.detached).map((a) => a.id);
    });
  }

  const detached = $derived(note.sidecar.threads.filter((t) => !t.resolved && detachedIds.includes(t.id)));

  function selectionQuote(e: Editor) {
    const { from, to } = e.state.selection;
    const ix = textIndex(e.state.doc);
    const s = ix.toOffset(from);
    const t = ix.toOffset(to);
    return { text: selectedText(e), quote: quoteAt(ix.text, s, t) };
  }

  /** After an action the menu stays closed until Kevin clicks or types again (agent edits move the selection). */
  let menuSuppressed = false;

  function onSelection() {
    const e = ed();
    if (!e) return;
    const { from, to, empty } = e.state.selection;
    if (empty || !selectedText(e).trim()) {
      if (!menu?.asking) menu = null;
      return;
    }
    if (menuSuppressed) return;
    const start = e.view.coordsAtPos(from);
    const end = e.view.coordsAtPos(to);
    const box = scroller.getBoundingClientRect();
    const mid = (start.left + end.left) / 2 - box.left;
    menu = { x: Math.max(170, Math.min(mid, box.width - 170)), y: start.top - box.top + scroller.scrollTop - 44, asking: false, question: "" };
  }

  /** A new thread on the current selection; pair's answer, status and cards appear in it. */
  async function openThread(first: string | null): Promise<string | null> {
    const e = ed();
    if (!e) return null;
    const t = threadForSelection(e, crypto.randomUUID(), first ? { author: "kevin", text: first } : null);
    if (!t) return null;
    note.sidecar.threads = [...note.sidecar.threads, t];
    setThreads(e, note.sidecar.threads);
    active = t.id;
    await saveSidecar();
    return t.id;
  }

  async function action(kind: "riddle" | "ask" | "visualize" | "doit") {
    const e = ed();
    if (!e || !menu) return;
    const selection = selectionQuote(e);
    menuSuppressed = kind !== "ask" || menu.asking;
    if (kind === "ask" && !menu.asking) {
      menu.asking = true;
      return;
    }
    const q = kind === "ask" ? menu.question.trim() : "";
    if (kind === "ask" && !q) return;
    menu = null;
    const threadId = await openThread(q || null);
    if (!threadId) return;
    await session.ask(kind as AskKind, { request: q || undefined, threadId, selection });
  }

  async function replyInThread(t: Thread, text: string) {
    note.sidecar.threads = note.sidecar.threads.map((x) => (x.id === t.id ? { ...x, messages: [...x.messages, { author: "kevin", text }] } : x));
    await saveSidecar();
    await session.ask("ask", { request: text, threadId: t.id, selection: { text: t.anchor.quote.exact, quote: t.anchor.quote } });
  }

  async function resolveThread(t: Thread) {
    note.sidecar.threads = note.sidecar.threads.map((x) => (x.id === t.id ? { ...x, resolved: true } : x));
    const e = ed();
    if (e) setThreads(e, note.sidecar.threads);
    await saveSidecar();
  }

  async function decideSuggestion(id: number, decision: "accept" | "reject", reason?: string) {
    const e = ed();
    if (!e) return;
    if (decision === "accept") accept(e, id);
    else reject(e, id);
    await session.onSuggestionDecided(id, decision, reason);
    scheduleSave();
  }

  /** Thinks-with-you: after a pause, read the paragraph Kevin was writing. */
  function onPause() {
    clearTimeout(pauseTimer);
    if (!thinks || !pi?.path) return;
    pauseTimer = setTimeout(() => {
      const e = ed();
      if (!e || session.running) return;
      const from$ = e.state.selection.$from;
      const block = from$.parent;
      const text = block.textContent.trim();
      if (block.type.name !== "paragraph" || text.length < 60 || !/[.?!:]$/.test(text) || seen.has(text)) return;
      seen.add(text);
      const ix = textIndex(e.state.doc);
      const s = ix.toOffset(from$.start());
      void session.ask("passive", { selection: { text, quote: quoteAt(ix.text, s, s + block.textContent.length) } });
    }, settings.pace === "slow" ? 4000 : 2000);
  }

  function inlineAsk(e: Editor): boolean {
    const from$ = e.state.selection.$from;
    const text = from$.parent.textContent;
    if (!/@pair\b/.test(text)) return false;
    const ix = textIndex(e.state.doc);
    const s = ix.toOffset(from$.start());
    const quote = quoteAt(ix.text, s, s + text.length);
    const t = { id: crypto.randomUUID(), anchor: { quote, pos: s }, messages: [], resolved: false, detached: false };
    note.sidecar.threads = [...note.sidecar.threads, t];
    setThreads(e, note.sidecar.threads);
    void saveSidecar();
    void session.ask("inline", { request: text.replace(/@pair\b/, "").trim(), threadId: t.id, selection: { text, quote } });
    return false;
  }

  async function setStage(stage: Stage) {
    note.sidecar.stage = stage;
    session.stageSuggestion = null;
    await saveSidecar();
  }

  async function setModel(model: string) {
    note.sidecar.model = model || null;
    await saveSidecar();
    const [provider, ...rest] = model.split("/");
    if (model) await agent.send(folder, note.name, { type: "set_model", provider, modelId: rest.join("/") }).catch(() => {});
  }

  async function openUndo() {
    checkpoints = await agent.checkpoints(folder, note.name).catch(() => []);
  }

  async function undoTo(cp: Checkpoint) {
    if (!confirm(`Put the project files back to how they were before “${cp.label}”? Files created since are removed. Your note is not touched, and the current state is saved as a new undo point first.`)) return;
    await agent.restore(folder, note.name, cp.n).then(
      (saved) => (notice = `Files restored to before “${cp.label}”. The state just before this undo is undo point #${saved.n}.`),
      (e) => (notice = String(e)),
    );
    checkpoints = null;
  }

  onMount(() => {
    editor = createEditor({
      ...editorOptions(note.markdown, {
        editorProps: {
          attributes: { class: "note-body", spellcheck: "true" },
          handleKeyDown: (_view, event) => (event.key === "Enter" && ed() ? inlineAsk(ed()!) : false),
        },
        onCreate: ({ editor: e }) => {
          setThreads(e as Editor, note.sidecar.threads);
          relayout();
        },
        onUpdate: () => {
          scheduleSave();
          onPause();
        },
        onTransaction: relayout,
        onSelectionUpdate: onSelection,
      }, host),
    } as never);
    agent.models().then((m) => (models = m)).catch(() => {});
    const key = noteKey(folder, note.name);
    const un = listen<AgentEvent>("agent-event", ({ payload }) => {
      if (payload.key !== key) return;
      const r = payload.record;
      void session.onRecord(r);
      // Files may have changed: refresh the tree and the open file.
      if (r.type === "pair_settled" || (r.type === "tool_execution_end" && ["edit", "write", "bash"].includes(r.toolName))) onFilesChanged();
    });
    // Clicking an underlined passage opens its thread.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const a = target?.closest?.("[data-thread]") as HTMLElement | null;
      if (a?.dataset.thread) active = a.dataset.thread;
    };
    column.addEventListener("click", onClick);
    // A press on blank page below the text puts the cursor at the end of the note. Handled on
    // mousedown, before ProseMirror places its own cursor in the last paragraph.
    const onBlankDown = (e: MouseEvent) => {
      const e2 = ed();
      const target = e.target as Element | null;
      if (!e2 || !target || !(target === scroller || target === page || target === column || target.classList.contains("note-body"))) return;
      const last = e2.view.dom.lastElementChild?.getBoundingClientRect();
      if (last && e.clientY <= last.bottom) return;
      e.preventDefault();
      // After a thread at the very end there is no line to type on: start a fresh one below it.
      const size = e2.state.doc.content.size;
      const lastNode = e2.state.doc.lastChild;
      const endsInThread = widgetPlacements(e2.state).some((w) => w.at === size);
      if (endsInThread && !(lastNode?.type.name === "paragraph" && lastNode.content.size === 0)) {
        e2.chain().insertContentAt(size, { type: "paragraph" }).focus("end").run();
      } else e2.commands.focus("end");
    };
    scroller.addEventListener("mousedown", onBlankDown, true);
    const onProposal = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; decision: "accept" | "reject"; reason?: string }>).detail;
      void decideSuggestion(d.id, d.decision, d.reason);
    };
    page.addEventListener("pair-proposal", onProposal);
    const unsuppress = () => (menuSuppressed = false);
    column.addEventListener("pointerdown", unsuppress);
    column.addEventListener("keydown", unsuppress);
    return () => {
      page.removeEventListener("pair-proposal", onProposal);
      column.removeEventListener("pointerdown", unsuppress);
      column.removeEventListener("keydown", unsuppress);
      column.removeEventListener("click", onClick);
      scroller.removeEventListener("mousedown", onBlankDown, true);
      void un.then((f) => f());
    };
  });

  onDestroy(() => {
    clearTimeout(pauseTimer);
    clearTimeout(saveTimer);
    // Read the editor now, before it is destroyed; write after any save already in flight.
    const e = ed();
    if (e) {
      const markdown = markdownOf(e);
      if (markdown !== lastSaved) {
        note.sidecar.threads = refreshQuotes(e, note.sidecar.threads);
        const snapshot = { ...($state.snapshot(note) as Note), markdown };
        const expected = lastSaved;
        void saving.then(() => api.saveNote(folder, snapshot, expected)).catch(() => {});
      }
    }
    void agent.close(folder, note.name).catch(() => {});
    for (const h of hosts.values()) void unmount(h.inst);
    hosts.clear();
    $editor?.destroy();
  });

  // Keep the active thread highlighted. Only `active` is tracked: dispatching updates the editor
  // store, so reading the editor here would re-run this effect forever.
  $effect(() => {
    const id = active;
    untrack(() => {
      const e = ed();
      if (e) setActiveThread(e, id);
    });
  });
</script>

<div class="note-view">
  <div class="main">
    <header class="bar" data-tauri-drag-region>
      <span class="who" title={session.running ? "pair is working" : "pair"}>
        <span class="dot" class:working={session.running}></span>pair
        {#if session.running && session.activity}<span class="status">{session.activity.status}…</span>{/if}
        {#if session.queued}<span class="status">{session.queued} waiting</span>{/if}
      </span>
      <button class="quiet" title="Thinks with you: pair reads along after you pause. When you ask: it waits to be asked." onclick={() => (thinks = !thinks)}>
        {thinks ? "Thinks with you" : "When you ask"} <span class="chev">⌄</span>
      </button>
      <div class="stages" role="tablist" aria-label="Stage">
        {#each STAGES as s, i}
          {#if i}<span class="sep">·</span>{/if}
          <button role="tab" aria-selected={note.sidecar.stage === s.id} class:on={note.sidecar.stage === s.id} onclick={() => setStage(s.id)}>{s.label}</button>
        {/each}
      </div>
      <div class="right">
        {#if session.running || session.queued}<button class="quiet" onclick={() => session.stop()}>Stop</button>{/if}
        <select class="quiet" aria-label="Model" value={note.sidecar.model ?? ""} onchange={(e) => setModel(e.currentTarget.value)}>
          <option value="">{settings.default_model ?? "Pi default model"}</option>
          {#each models as m}<option value={m}>{m}</option>{/each}
        </select>
        <button class="quiet" onclick={openUndo}>Undo…</button>
        <button class="quiet" onclick={() => (exporting = true)}>Export</button>
      </div>
    </header>

    {#if pi && !pi.path}
      <p class="banner bad">Pi is not installed or not on your login shell PATH. Install it, sign in with <code>pi</code>, then reopen pair.</p>
    {:else if pi && pi.version && pi.expected && pi.version !== pi.expected}
      <p class="banner">Pi {pi.version} is installed; pair was tested with {pi.expected}. It will still run.</p>
    {/if}
    {#if interruptedMsg}
      <p class="banner">The app closed while pair was working on this note. <button class="btn" onclick={() => { session.ask("retry", { request: interruptedMsg! }); interruptedMsg = null; }}>Retry</button> <button class="btn" onclick={() => (interruptedMsg = null)}>Dismiss</button></p>
    {/if}
    {#if session.crash}
      <div class="banner bad">
        pair's agent stopped unexpectedly{session.crash.code !== null ? ` (exit ${session.crash.code})` : ""}.
        <button class="btn" onclick={() => session.retryLast()}>Restart</button>
        {#if session.crash.stderr}<pre>{session.crash.stderr}</pre>{/if}
      </div>
    {/if}
    {#if session.error}<p class="banner bad">{session.error} <button class="btn" onclick={() => (session.error = null)}>×</button></p>{/if}
    {#if session.stageSuggestion}
      <p class="banner">pair suggests moving to <strong>{session.stageSuggestion.stage}</strong>: {session.stageSuggestion.why}
        <button class="btn ok" onclick={() => setStage(session.stageSuggestion!.stage as Stage)}>Move</button>
        <button class="btn" onclick={() => (session.stageSuggestion = null)}>Not yet</button></p>
    {/if}
    {#if notice}<p class="banner">{notice} <button class="btn" onclick={() => (notice = null)}>×</button></p>{/if}

    <div class="scroller" bind:this={scroller}>
      <div class="page" bind:this={page}>
        <div class="column" bind:this={column}>
          <div class="tell">
            <label for="tell">Tell pair</label>
            <input id="tell" placeholder="what this note is for, e.g. “Ship the basket fix by Friday.”" bind:value={note.sidecar.tell} onchange={saveSidecar} />
          </div>
          {#if $editor}<EditorContent editor={$editor} />{/if}

          {#if detached.length || session.cards.some((c) => c.threadId === null) || session.loose.length}
            <section class="elsewhere">
              <h3>Not tied to a passage</h3>
              {#each detached as t (t.id)}
                <Exchange wkey={`t:${t.id}`} {ctx} quoted />
              {/each}
              {#each session.cards.filter((c) => c.threadId === null) as card (card.requestId)}
                <CardView {card} onDecide={(d, o) => session.decideCard(card, d, o)} />
              {/each}
              {#each session.loose as text, i (i)}
                <div class="loose"><span class="dot"></span><p>{text}</p></div>
              {/each}
            </section>
          {/if}
        </div>
        <section class="print-only print-threads">
          {#if note.sidecar.threads.some((t) => !t.resolved && t.messages.length)}<h2>Threads</h2>{/if}
          <ol>
            {#each note.sidecar.threads.filter((t) => !t.resolved && t.messages.length) as t (t.id)}
              <li><em>“{t.anchor.quote.exact}”</em> — {#each t.messages as m}<span>{m.author === "agent" ? "pair" : "you"}: {m.text} </span>{/each}</li>
            {/each}
          </ol>
        </section>
      </div>
      {#if menu}
        <div class="menu" style={`left:${menu.x}px; top:${menu.y}px`} role="toolbar" aria-label="Ask pair about the selection">
          {#if menu.asking}
            <input use:focusOnMount placeholder="Ask about this…" bind:value={menu.question} onkeydown={(e) => (e.key === "Enter" ? action("ask") : e.key === "Escape" && (menu = null))} />
            <button onclick={() => action("ask")}>Ask</button>
          {:else}
            <button onmousedown={(e) => e.preventDefault()} onclick={() => action("riddle")}>Riddle this</button>
            <button onmousedown={(e) => e.preventDefault()} onclick={() => action("ask")}>Ask</button>
            <button onmousedown={(e) => e.preventDefault()} onclick={() => action("visualize")}>Visualize</button>
            <button onmousedown={(e) => e.preventDefault()} onclick={() => action("doit")}>Do it</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if exporting}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="overlay" onclick={(e) => e.target === e.currentTarget && (exporting = false)}>
      <div class="sheet">
        <h3>Export</h3>
        <label class="toggle"><input type="checkbox" bind:checked={justMyWords} /> Just my words (leave out pair's replies and margin threads)</label>
        <div class="row-end">
          <button class="btn" onclick={async () => { await save(); notice = await exportMarkdown(note, justMyWords); exporting = false; }}>Markdown…</button>
          <button class="btn primary" onclick={async () => { await save(); exporting = false; exportPdf(justMyWords); }}>PDF…</button>
        </div>
      </div>
    </div>
  {/if}

  {#if checkpoints}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="overlay" onclick={(e) => e.target === e.currentTarget && (checkpoints = null)}>
      <div class="sheet">
        <h3>Undo points</h3>
        <p class="muted">One is saved before each change you approve. Restoring changes project files only.</p>
        {#each [...checkpoints].reverse() as cp (cp.n)}
          <div class="cp"><span>#{cp.n} · before {cp.label}</span><button class="btn" onclick={() => undoTo(cp)}>Restore</button></div>
        {:else}
          <p>No undo points yet.</p>
        {/each}
        <div class="row-end">
          <button class="btn" onclick={() => (checkpoints = null)}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .note-view { flex: 1; display: flex; min-width: 0; min-height: 0; }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .bar { height: 44px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 18px 0 22px; font-size: 13px; color: var(--ink-faint); overflow: hidden; container-type: inline-size; }
  .who { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); white-space: nowrap; min-width: 0; flex: 0 1 auto; overflow: hidden; }
  .bar > .quiet, .stages { flex: none; }
  .right { min-width: 0; }
  /* Narrow (file pane open): drop the least-used controls first. */
  @container (max-width: 640px) { select.quiet, .status { display: none; } }
  @container (max-width: 520px) { .stages .sep, .bar > .quiet { display: none; } }
  .status { color: var(--ink-faint); font-style: italic; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .quiet { color: var(--ink-faint); font-size: 13px; white-space: nowrap; }
  .quiet:hover { color: var(--ink); }
  .chev { font-size: 10px; }
  .stages { display: flex; align-items: center; gap: 6px; }
  .stages button { color: var(--ink-faint); }
  .stages button:hover { color: var(--ink-soft); }
  .stages button.on { color: var(--ink); }
  .sep { color: var(--rule); }
  .right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  select.quiet { border: 0; background: none; max-width: 200px; padding: 0; appearance: none; cursor: pointer; text-overflow: ellipsis; }
  .banner { margin: 6px 22px 0; padding: 8px 12px; border-radius: 8px; background: var(--sidebar); font-size: 13px; }
  .banner.bad { background: var(--bad-soft); color: var(--bad); }
  .banner pre { white-space: pre-wrap; font-size: 11px; max-height: 120px; overflow: auto; }
  .scroller { flex: 1; overflow-y: auto; position: relative; }
  .page { display: flex; justify-content: center; padding: 36px 32px 0; min-height: 100%; }
  .column { width: 680px; max-width: 100%; position: relative; }
  .tell { display: flex; gap: 10px; align-items: baseline; margin-bottom: 26px; font-size: 13px; }
  .tell label { color: var(--ink-faint); white-space: nowrap; }
  .tell input { flex: 1; border: 0; background: transparent; outline: none; font-family: var(--serif); font-size: 16px; color: var(--ink); }
  .tell input::placeholder { color: var(--ink-faint); opacity: 0.7; }
  .elsewhere { margin-top: 48px; padding-top: 14px; border-top: 1px solid var(--rule); }
  .elsewhere h3 { font-size: 12px; font-weight: 500; color: var(--ink-faint); margin: 0 0 12px; }
  .loose { display: grid; grid-template-columns: 7px 1fr; column-gap: 12px; font-family: var(--serif); color: var(--agent-ink); }
  .loose .dot { margin-top: 0.62em; }
  .loose p { margin: 0 0 10px; white-space: pre-wrap; }
  .menu { position: absolute; transform: translateX(-50%); display: flex; gap: 2px; padding: 4px; background: var(--ink); color: var(--bg); border-radius: 999px; z-index: 20; box-shadow: 0 6px 18px color-mix(in srgb, var(--ink) 20%, transparent); }
  .menu button { padding: 4px 12px; border-radius: 999px; font-size: 13px; white-space: nowrap; }
  .menu button:hover { background: color-mix(in srgb, var(--bg) 18%, transparent); }
  .menu input { width: 260px; border: 0; border-radius: 999px; padding: 4px 10px; background: var(--bg); color: var(--ink); outline: none; }
  .overlay { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 30%, transparent); display: grid; place-items: center; z-index: 40; }
  .sheet { width: min(520px, 92vw); max-height: 80vh; overflow: auto; background: var(--surface); border-radius: 12px; padding: 18px 20px; }
  .sheet h3 { margin: 0 0 4px; }
  .cp { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--rule); font-size: 13px; }
  .row-end { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

  /* Kevin writes in sans; pair's ink is serif. */
  :global(.note-body) { outline: none; font-family: var(--sans); font-size: var(--text-size); line-height: 1.75; color: var(--ink); min-height: 40vh; padding-bottom: 30vh; cursor: text; }
  :global(.note-body > *:first-child) { margin-top: 0; }
  :global(.note-body p) { margin: 0 0 0.8em; }
  :global(.note-body h1) { font-size: 1.75em; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; margin: 0 0 0.6em; }
  :global(.note-body h2) { font-size: 1.2em; font-weight: 600; letter-spacing: -0.01em; margin: 1.6em 0 0.4em; }
  :global(.note-body h3) { font-size: 1.05em; font-weight: 600; margin: 1.3em 0 0.3em; }
  :global(.note-body code) { font-family: var(--mono); font-size: 0.82em; background: var(--sidebar); padding: 1px 4px; border-radius: 4px; }
  :global(.note-body pre) { font-family: var(--mono); font-size: 13px; background: var(--sidebar); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
  :global(.note-body p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--ink-faint); pointer-events: none; float: left; height: 0; }
  /* A passage pair is talking about: a soft underline, washed when its thread is active. */
  :global(.note-body .anchor) { background-image: linear-gradient(var(--line), var(--line)); background-size: 100% 1px; background-repeat: no-repeat; background-position: 0 95%; cursor: pointer; }
  :global(.note-body .anchor.active) { background-color: var(--mark); background-image: linear-gradient(var(--ink-soft), var(--ink-soft)); }
  :global(.note-body .sg-insertion), :global(.note-body ins) { color: var(--ok); text-decoration: none; background: var(--ok-soft); }
  :global(.note-body .sg-deletion), :global(.note-body del) { color: var(--bad); background: var(--bad-soft); }
  :global(.note-body .block-proposal) { outline: 1px dashed var(--line); outline-offset: 6px; border-radius: 6px; }
  /* A pending block sits inside the insertion mark; keep its own colours. */
  :global(.note-body ins.sg-insertion:has(.block-proposal)) { display: block; color: inherit; background: none; }
  :global(.note-body .pair-widget) { white-space: normal; }
</style>
