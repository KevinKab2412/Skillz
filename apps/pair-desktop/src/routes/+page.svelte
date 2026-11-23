<script lang="ts">
  import "../app.css";
  import { onMount, tick } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import NoteView from "$lib/components/NoteView.svelte";
  import SettingsSheet from "$lib/components/SettingsSheet.svelte";
  import FilePane from "$lib/components/FilePane.svelte";
  import ReviewView from "$lib/components/ReviewView.svelte";
  import { agent, api, noteKey, settingsApi, type Note, type NoteKind, type NoteSummary, type PiStatus, type Settings } from "$lib/api";

  let folders = $state<string[]>([]);
  let notesByFolder = $state<Record<string, NoteSummary[]>>({});
  let current = $state<{ folder: string; note: Note } | null>(null);
  let error = $state<string | null>(null);
  let settings = $state<Settings | null>(null);
  let pi = $state<PiStatus | null>(null);
  let interrupted = $state<Record<string, string>>({});
  let showSettings = $state(false);
  let view = $state<NoteView>();
  let reviewView = $state<ReviewView>();
  let files = $state<string[]>([]);
  let filesFolder: string | null = null;
  let openFile = $state<string | null>(null);
  let fileTick = $state(0);
  let navigationRequest = 0;
  let pendingNavigation: { folder: string; name: string; request: number } | null = null;

  async function loadFiles(folder: string, request = navigationRequest) {
    if (filesFolder !== folder) openFile = null;
    filesFolder = folder;
    const nextFiles = await api.listFiles(folder).catch(() => []);
    if (request === navigationRequest && current?.folder === folder) files = nextFiles;
  }

  /** After pair changes files, the tree and the open file are re-read. */
  function filesChanged() {
    if (current) void loadFiles(current.folder);
    fileTick++;
  }

  $effect(() => {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.appearance === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.appearance;
    root.dataset.size = settings.text_size;
    root.style.setProperty("--accent", settings.accent);
  });

  async function refresh(folder: string) {
    notesByFolder[folder] = await api.listNotes(folder);
  }

  async function boot() {
    settings = await settingsApi.get();
    interrupted = await agent.interrupted().catch(() => ({}));
    agent.status().then((s) => (pi = s)).catch(() => {});
    const ix = await api.loadIndex();
    folders = ix.folders;
    for (const f of folders) {
      await api.watchFolder(f).catch(() => {});
      await refresh(f).catch(() => {});
    }
    const last = ix.recent[0];
    if (last && folders.includes(last.folder) && navigationRequest === 0) {
      await openNote(last.folder, last.name).catch(() => {});
    }
  }

  async function addFolder() {
    const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
    if (typeof picked !== "string") return;
    folders = (await api.addFolder(picked)).folders;
    await api.watchFolder(picked);
    await refresh(picked);
  }

  async function openNote(folder: string, name: string) {
    const request = ++navigationRequest;
    pendingNavigation = { folder, name, request };
    try {
      const note = await api.openNote(folder, name);
      if (request !== navigationRequest) return;
      current = { folder, note };
      void loadFiles(folder, request);
    } finally {
      if (pendingNavigation?.request === request) pendingNavigation = null;
    }
  }

  async function newNote(folder: string, kind: NoteKind = "note") {
    const request = ++navigationRequest;
    pendingNavigation = null;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const prefix = kind === "code_review" ? "review" : "note";
    let name = `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const taken = new Set((notesByFolder[folder] ?? []).map((n) => n.name));
    for (let i = 2; taken.has(name); i++) name = name.replace(/(-\d+)?$/, `-${i}`);
    const note = await api.createNote(folder, name, kind);
    await refresh(folder);
    if (request !== navigationRequest) return;
    current = { folder, note };
    void loadFiles(folder, request);
  }

  async function deleteNote(folder: string, name: string) {
    if (!confirm(`Delete “${name}”? Its note content, review data, Pair conversation, and undo history will be removed. Project files will stay.`)) return;

    const previous = current;
    const selected = previous?.folder === folder && previous.note.name === name;
    const opening = pendingNavigation?.folder === folder && pendingNavigation.name === name;
    if (selected || opening) {
      navigationRequest++;
      pendingNavigation = null;
    }

    try {
      if (selected) {
        if (previous.note.sidecar.kind === "code_review") await reviewView?.prepareForDeletion();
        else await view?.prepareForDeletion();
        current = null;
        view = undefined;
        reviewView = undefined;
        files = [];
        filesFolder = null;
        openFile = null;
        await tick();
      }

      await api.deleteNote(folder, name);
      await refresh(folder);

      if (selected) {
        const ix = await api.loadIndex();
        const next = ix.recent.find((recent) => folders.includes(recent.folder));
        const fallback = folders.flatMap((project) => (notesByFolder[project] ?? []).map((note) => ({ folder: project, name: note.name })))
          .find((note) => !(note.folder === folder && note.name === name));
        const target = next ?? fallback;
        if (target) await openNote(target.folder, target.name);
      }
    } catch (e) {
      error = String(e);
      if (selected && previous) {
        current = previous;
        void loadFiles(previous.folder);
      }
    }
  }

  async function saveSettings(next: Settings) {
    settings = next;
    await settingsApi.set($state.snapshot(next) as Settings);
    pi = await agent.status().catch(() => pi);
  }

  onMount(() => {
    boot().catch((e) => (error = String(e)));
    const un = listen<{ folder: string; name: string }>("note-changed", async ({ payload }) => {
      await refresh(payload.folder).catch(() => {});
      if (current && current.folder === payload.folder && current.note.name === payload.name) {
        const disk = await api.openNote(payload.folder, payload.name).catch(() => null);
        if (disk) view?.reloadFromDisk(disk);
      }
    });
    return () => void un.then((f) => f());
  });
</script>

<div class="app">
  <Sidebar
    {folders}
    {notesByFolder}
    current={current ? { folder: current.folder, name: current.note.name } : null}
    onAddFolder={addFolder}
    onOpen={(f, n) => openNote(f, n).catch((e) => (error = String(e)))}
    onDelete={(f, n) => deleteNote(f, n)}
    onNew={(f, kind) => newNote(f, kind).catch((e) => (error = String(e)))}
    onSettings={() => (showSettings = true)}
    {files}
    {openFile}
    onOpenFile={(p) => (openFile = p)} />

  <main>
    {#if error}<p class="error" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}
    {#if current && settings}
      <div class="split">
      {#key current.folder + "::" + current.note.name}
        {#if current.note.sidecar.kind === "code_review"}
          <svelte:boundary>
            <ReviewView bind:this={reviewView} folder={current.folder} bind:note={current.note} {settings} {pi}
              interrupted={interrupted[noteKey(current.folder, current.note.name)] ?? null} />
            {#snippet failed(failure)}
              <div class="error" role="alert">Could not open this code review: {String(failure)}</div>
            {/snippet}
          </svelte:boundary>
        {:else}
          <NoteView bind:this={view} folder={current.folder} bind:note={current.note} {settings} {pi} {files} {openFile} onFilesChanged={filesChanged}
            interrupted={interrupted[noteKey(current.folder, current.note.name)] ?? null} />
        {/if}
      {/key}
      {#if openFile}<FilePane folder={current.folder} path={openFile} tick={fileTick} onClose={() => (openFile = null)} />{/if}
      </div>
    {:else}
      <div class="bar" data-tauri-drag-region></div>
      <div class="empty">
        <p class="muted">{folders.length ? "Pick a note or start a new one." : "Open a project folder to start."}</p>
        {#if !folders.length}<button class="btn primary" onclick={addFolder}>Open folder…</button>{/if}
      </div>
    {/if}
  </main>
</div>

{#if showSettings && settings}
  <SettingsSheet {settings} {pi} onSave={saveSettings} onClose={() => (showSettings = false)} />
{/if}

<style>
  .app { display: flex; height: 100vh; }
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .split { flex: 1; display: flex; min-height: 0; }
  .bar { height: 44px; flex: none; border-bottom: 1px solid var(--rule); }
  .empty { flex: 1; display: grid; place-content: center; text-align: center; gap: 12px; }
  .error { margin: 8px 20px; padding: 8px 12px; border-radius: 6px; background: var(--bad-soft); color: var(--bad); }
</style>
