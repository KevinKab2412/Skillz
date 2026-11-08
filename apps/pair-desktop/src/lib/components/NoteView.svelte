<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
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
    proposeBlock,
    refreshQuotes,
    reject,
    selectedText,
    setActiveThread,
    setThreads,
    threadForSelection,
  } from "$lib/editor/note";
  import { suggestionGroups } from "$lib/editor/extensions";
  import { quoteAt, textIndex } from "$lib/editor/anchors";
  import Margin, { type MarginItem } from "./Margin.svelte";
  import ChatPanel from "./ChatPanel.svelte";
  import { exportMarkdown, exportPdf } from "$lib/export";

  let {
    folder,
    note = $bindable(),
    settings,
    pi,
    interrupted = null,
  }: { folder: string; note: Note; settings: Settings; pi: PiStatus | null; interrupted?: string | null } = $props();

  let editor = $state<Readable<Editor>>();
  let column: HTMLDivElement;
  let scroller: HTMLDivElement;
  let page: HTMLDivElement;
  let items = $state<MarginItem[]>([]);
  let active = $state<string | null>(null);
  let chatOpen = $state(false);
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
        } catch {
          notice = "No undo point: this folder is not a git repository.";
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
  );

  // Pending card → make sure Kevin sees it.
  $effect(() => {
    if (session.chat.some((c) => c.type === "card" && c.card.status === "pending")) chatOpen = true;
  });

  async function saveSidecar() {
    await api.saveSidecar(folder, note.name, $state.snapshot(note.sidecar) as Note["sidecar"]).catch((e) => (notice = String(e)));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  async function save() {
    clearTimeout(saveTimer);
    const e = ed();
    if (!e) return;
    const markdown = markdownOf(e);
    note.sidecar.threads = refreshQuotes(e, note.sidecar.threads);
    note.markdown = markdown;
    lastSaved = markdown;
    await api.saveNote(folder, $state.snapshot(note) as Note).catch((err) => (notice = String(err)));
  }

  /** Called by the page when the file changed on disk. */
  export function reloadFromDisk(fresh: Note) {
    const e = ed();
    if (!e || fresh.markdown === lastSaved) return;
    lastSaved = fresh.markdown;
    note.markdown = fresh.markdown;
    note.sidecar = fresh.sidecar;
    e.commands.setContent(fresh.markdown, { contentType: "markdown", emitUpdate: false } as never);
    setThreads(e, note.sidecar.threads);
    notice = "The note changed on disk and was reloaded. Pending suggestions were dropped.";
  }

  let raf = 0;
  function relayout() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const e = ed();
      if (!e || !column || !e.view.dom.isConnected) return;
      const base = column.getBoundingClientRect().top;
      const out: MarginItem[] = [];
      const byId = new Map(note.sidecar.threads.map((t) => [t.id, t]));
      for (const a of liveAnchors(e)) {
        const t = byId.get(a.id);
        if (!t || a.detached) continue;
        out.push({ key: a.id, kind: "thread", want: e.view.coordsAtPos(a.from).top - base, thread: t });
      }
      for (const g of suggestionGroups(e.state.doc)) {
        if (g.block) continue;
        out.push({ key: `s${g.id}`, kind: "suggestion", want: e.view.coordsAtPos(g.from).top - base, id: g.id, ins: g.ins, del: g.del });
      }
      items = out;
    });
  }

  const detached = $derived.by(() => {
    const live = new Set(items.filter((i) => i.kind === "thread").map((i) => i.key));
    return note.sidecar.threads.filter((t) => !t.resolved && !live.has(t.id));
  });

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

  async function action(kind: "riddle" | "ask" | "visualize" | "doit") {
    const e = ed();
    if (!e || !menu) return;
    const selection = selectionQuote(e);
    menuSuppressed = kind !== "ask" || menu.asking;
    if (kind === "ask") {
      if (!menu.asking) {
        menu.asking = true;
        return;
      }
      const q = menu.question.trim();
      if (!q) return;
      const t = threadForSelection(e, crypto.randomUUID(), { author: "kevin", text: q });
      if (!t) return;
      note.sidecar.threads = [...note.sidecar.threads, t];
      setThreads(e, note.sidecar.threads);
      active = t.id;
      await saveSidecar();
      menu = null;
      await session.ask("ask", { request: q, threadId: t.id, selection });
      return;
    }
    menu = null;
    if (kind === "doit") chatOpen = true;
    await session.ask(kind, { selection });
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
    void session.ask("inline", { request: text.replace(/@pair\b/, "").trim(), selection: { text, quote: quoteAt(ix.text, s, s + text.length) } });
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
    if (!confirm(`Put the project files back to how they were before “${cp.label}”? Later changes to those files are undone; your note is not touched.`)) return;
    await agent.restore(folder, note.name, cp.n).then(
      () => (notice = `Files restored to before “${cp.label}”.`),
      (e) => (notice = String(e)),
    );
    checkpoints = null;
  }

  function addToNote(text: string) {
    const e = ed();
    if (!e) return;
    proposeBlock(e, "pairReply", { text }, e.state.selection.empty ? undefined : selectionQuote(e).quote);
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
      }),
    } as never);
    agent.models().then((m) => (models = m)).catch(() => {});
    const key = noteKey(folder, note.name);
    const un = listen<AgentEvent>("agent-event", ({ payload }) => {
      if (payload.key === key) void session.onRecord(payload.record);
    });
    const ro = new ResizeObserver(relayout);
    ro.observe(column);
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
      ro.disconnect();
      void un.then((f) => f());
    };
  });

  onDestroy(() => {
    clearTimeout(pauseTimer);
    void save();
    void agent.close(folder, note.name).catch(() => {});
    $editor?.destroy();
  });

  // Keep the active thread highlighted in the text.
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
      <span class="title">{note.name}</span>
      <div class="stages" role="tablist" aria-label="Stage">
        {#each STAGES as s}
          <button role="tab" aria-selected={note.sidecar.stage === s.id} class:on={note.sidecar.stage === s.id} onclick={() => setStage(s.id)}>{s.label}</button>
        {/each}
      </div>
      <div class="right">
        {#if session.running}
          <span class="busy">pair is working{session.queued ? ` · ${session.queued} waiting` : ""}</span>
          <button class="btn" onclick={() => session.stop()}>Stop</button>
        {:else if session.queued}
          <span class="busy">{session.queued} waiting</span>
        {/if}
        <label class="toggle" title="pair reads along after you pause and may leave margin notes">
          <input type="checkbox" bind:checked={thinks} /> Thinks with you
        </label>
        <select aria-label="Model" value={note.sidecar.model ?? ""} onchange={(e) => setModel(e.currentTarget.value)}>
          <option value="">{settings.default_model ?? "Pi default model"}</option>
          {#each models as m}<option value={m}>{m}</option>{/each}
        </select>
        <button class="btn" onclick={openUndo}>Undo…</button>
        <button class="btn" onclick={() => (exporting = true)}>Export</button>
        <button class="btn" class:primary={chatOpen} onclick={() => (chatOpen = !chatOpen)}>Chat</button>
      </div>
    </header>

    <div class="tell">
      <label for="tell">Tell pair</label>
      <input id="tell" placeholder="A standing instruction for this note, e.g. “prefer small diffs; we use bun”" bind:value={note.sidecar.tell} onchange={saveSidecar} />
    </div>

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
      <p class="banner accent">pair suggests moving to <strong>{session.stageSuggestion.stage}</strong>: {session.stageSuggestion.why}
        <button class="btn ok" onclick={() => setStage(session.stageSuggestion!.stage as Stage)}>Move</button>
        <button class="btn" onclick={() => (session.stageSuggestion = null)}>Not yet</button></p>
    {/if}
    {#if notice}<p class="banner">{notice} <button class="btn" onclick={() => (notice = null)}>×</button></p>{/if}

    <div class="scroller" bind:this={scroller}>
      <div class="page" bind:this={page}>
        <div class="column" bind:this={column}>
          {#if $editor}<EditorContent editor={$editor} />{/if}
        </div>
        <section class="print-only print-threads">
          {#if note.sidecar.threads.some((t) => !t.resolved && t.messages.length)}<h2>Margin notes</h2>{/if}
          <ol>
            {#each note.sidecar.threads.filter((t) => !t.resolved && t.messages.length) as t (t.id)}
              <li><em>“{t.anchor.quote.exact}”</em> — {#each t.messages as m}<span>{m.author === "agent" ? "pair" : "you"}: {m.text} </span>{/each}</li>
            {/each}
          </ol>
        </section>
        <Margin {items} {detached} {active} onActivate={(id) => (active = id)} onReply={replyInThread} onResolve={resolveThread} onSuggestion={decideSuggestion} />
      </div>
      {#if menu}
        <div class="menu" style={`left:${menu.x}px; top:${menu.y}px`} role="toolbar" aria-label="Ask pair about the selection">
          {#if menu.asking}
            <!-- svelte-ignore a11y_autofocus -->
            <input autofocus placeholder="Ask about this…" bind:value={menu.question} onkeydown={(e) => (e.key === "Enter" ? action("ask") : e.key === "Escape" && (menu = null))} />
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

  {#if chatOpen}
    <ChatPanel {session} onAddToNote={addToNote} onClose={() => (chatOpen = false)} />
  {/if}

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
  .bar { height: 44px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; border-bottom: 1px solid var(--rule); }
  .title { font-weight: 600; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  .stages { display: flex; background: var(--sidebar); border-radius: 8px; padding: 2px; }
  .stages button { padding: 4px 12px; border-radius: 6px; color: var(--ink-soft); }
  .stages button.on { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--rule); font-weight: 600; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .busy { font-size: 12px; color: var(--accent); }
  .toggle { font-size: 12px; color: var(--ink-soft); display: flex; gap: 4px; align-items: center; white-space: nowrap; }
  select { max-width: 180px; padding: 3px 6px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }
  .tell { display: flex; gap: 10px; align-items: center; padding: 6px 16px; border-bottom: 1px solid var(--rule); font-size: 13px; }
  .tell label { color: var(--ink-faint); white-space: nowrap; }
  .tell input { flex: 1; border: 0; background: transparent; outline: none; }
  .banner { margin: 8px 16px 0; padding: 8px 12px; border-radius: 8px; background: var(--sidebar); font-size: 13px; }
  .banner.bad { background: var(--bad-soft); color: var(--bad); }
  .banner.accent { background: var(--accent-soft); }
  .banner pre { white-space: pre-wrap; font-size: 11px; max-height: 120px; overflow: auto; }
  .scroller { flex: 1; overflow-y: auto; position: relative; }
  .page { display: flex; gap: 32px; justify-content: center; padding: 40px 24px 160px; }
  .column { width: 680px; max-width: 100%; position: relative; }
  .menu { position: absolute; transform: translateX(-50%); display: flex; gap: 2px; padding: 4px; background: var(--ink); color: var(--bg); border-radius: 8px; z-index: 20; box-shadow: 0 6px 18px color-mix(in srgb, var(--ink) 25%, transparent); }
  .menu button { padding: 4px 10px; border-radius: 5px; font-size: 13px; white-space: nowrap; }
  .menu button:hover { background: color-mix(in srgb, var(--bg) 18%, transparent); }
  .menu input { width: 260px; border: 0; border-radius: 5px; padding: 4px 8px; background: var(--bg); color: var(--ink); }
  .overlay { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 30%, transparent); display: grid; place-items: center; z-index: 40; }
  .sheet { width: min(520px, 92vw); max-height: 80vh; overflow: auto; background: var(--surface); border-radius: 12px; padding: 18px 20px; }
  .sheet h3 { margin: 0 0 4px; }
  .cp { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--rule); font-size: 13px; }
  .row-end { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

  :global(.note-body) { outline: none; font-family: var(--serif); font-size: var(--text-size); line-height: 1.65; color: var(--ink); }
  :global(.note-body h1) { font-size: 1.9em; line-height: 1.2; margin: 0 0 0.6em; }
  :global(.note-body h2) { font-size: 1.25em; margin: 1.6em 0 0.4em; padding-top: 0.6em; border-top: 1px solid var(--rule); }
  :global(.note-body code) { font-family: var(--mono); font-size: 0.85em; background: var(--sidebar); padding: 1px 4px; border-radius: 4px; }
  :global(.note-body pre) { font-family: var(--mono); font-size: 13px; background: var(--sidebar); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
  :global(.note-body .anchor) { background: color-mix(in srgb, #f5d76e 35%, transparent); border-bottom: 1px solid #e0b93a; }
  :global(.note-body .anchor.active) { background: color-mix(in srgb, #f5d76e 70%, transparent); }
  :global(.note-body .sg-insertion), :global(.note-body ins) { color: var(--ok); text-decoration: none; background: var(--ok-soft); }
  :global(.note-body .sg-deletion), :global(.note-body del) { color: var(--bad); background: var(--bad-soft); }
  :global(.note-body .block-proposal) { outline: 1px dashed var(--accent); outline-offset: 4px; border-radius: 6px; }
  /* A pending block sits inside the insertion mark; keep its own colours. */
  :global(.note-body ins.sg-insertion:has(.block-proposal)) { display: block; color: inherit; background: none; }
</style>
