<script lang="ts">
  import "../app.css";
  import { onMount, tick } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open } from "@tauri-apps/plugin-dialog";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Launcher from "$lib/components/Launcher.svelte";
  import NoteView from "$lib/components/NoteView.svelte";
  import SettingsSheet from "$lib/components/SettingsSheet.svelte";
  import FilePane from "$lib/components/FilePane.svelte";
  import ReviewView from "$lib/components/ReviewView.svelte";
  import type { CodeReference } from "$lib/code-references";
  import { agent, api, automaticallyNamed, noteKey, noteLabel, settingsApi, type Note, type NoteKind, type NoteSummary, type PiStatus, type Settings } from "$lib/api";

  let recentFolders = $state<string[]>([]);
  let booted = $state(false);
  let notesByFolder = $state<Record<string, NoteSummary[]>>({});
  let current = $state<{ folder: string; note: Note } | null>(null);
  let error = $state<string | null>(null);
  let settings = $state<Settings | null>(null);
  let pi = $state<PiStatus | null>(null);
  let interrupted = $state<Record<string, string>>({});
  let showSettings = $state(false);
  let projectFolder = $state<string | null>(null);
  let isLauncher = true;
  let view = $state<NoteView>();
  let reviewView = $state<ReviewView>();
  let files = $state<string[]>([]);
  let filesFolder: string | null = null;
  let filePane = $state<{ path: string; reference?: CodeReference } | null>(null);
  const openFile = $derived(filePane?.path ?? null);
  let fileTick = $state(0);
  let navigationRequest = 0;
  let pendingNavigation: { folder: string; name: string; request: number } | null = null;
  const titling = new Set<string>();

  async function loadFiles(folder: string, request = navigationRequest) {
    if (filesFolder !== folder) filePane = null;
    filesFolder = folder;
    const nextFiles = await api.listFiles(folder).catch(() => []);
    if (request === navigationRequest && projectFolder === folder) files = nextFiles;
  }

  /** After pair changes files, the tree and the open file are re-read. */
  function filesChanged() {
    if (projectFolder) void loadFiles(projectFolder);
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

  async function titleStartedNote(folder: string, note: Note) {
    const { name, sidecar } = note;
    if (!automaticallyNamed(name) || sidecar.title) return;
    if (sidecar.kind === "code_review" ? !sidecar.review?.guide : !note.markdown.trim()) return;
    const key = noteKey(folder, name);
    if (titling.has(key)) return;
    titling.add(key);
    try {
      const title = await api.titleNote(folder, name);
      if (!title) return;
      if (current?.folder === folder && current.note.name === name) current.note.sidecar.title = title;
      await refresh(folder);
    } catch {
      // Titles are optional. Retry on the next save or when the note is reopened.
    } finally {
      titling.delete(key);
    }
  }

  async function boot() {
    const folder = new URLSearchParams(window.location.search).get("folder");
    isLauncher = !folder;
    settings = await settingsApi.get();
    interrupted = await agent.interrupted().catch(() => ({}));
    agent.status().then((s) => (pi = s)).catch(() => {});
    const ix = await api.loadIndex();
    if (folder) {
      await api.addFolder(folder);
      projectFolder = folder;
      await api.watchFolder(folder);
      await refresh(folder);
      void loadFiles(folder);
      const last = ix.recent.find((recent) => recent.folder === folder);
      if (last) await openNote(last.folder, last.name).catch((e) => (error = String(e)));
      booted = true;
      return;
    }
    recentFolders = [...new Set([...ix.recent.map((recent) => recent.folder), ...ix.folders])];
    booted = true;
  }

  async function openProject(folder: string) {
    if ("__TAURI_INTERNALS__" in window) {
      await api.openFolderWindow(folder);
      if (isLauncher) await getCurrentWindow().close();
      return;
    }
    await api.addFolder(folder);
    projectFolder = folder;
    await api.watchFolder(folder);
    await refresh(folder);
    void loadFiles(folder);
    booted = true;
  }

  async function addFolder() {
    const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
    if (typeof picked === "string") await openProject(picked);
  }

  async function openNote(folder: string, name: string) {
    const request = ++navigationRequest;
    pendingNavigation = { folder, name, request };
    try {
      const note = await api.openNote(folder, name);
      if (request !== navigationRequest) return;
      current = { folder, note };
      void titleStartedNote(folder, note);
      void loadFiles(folder, request);
    } finally {
      if (pendingNavigation?.request === request) pendingNavigation = null;
    }
  }

  async function newNote(folder: string, kind: NoteKind = "note") {
    const request = ++navigationRequest;
    pendingNavigation = null;
    const prefix = kind === "code_review" ? "review" : "note";
    const name = `${prefix}-${crypto.randomUUID()}`;
    const note = await api.createNote(folder, name, kind);
    await refresh(folder);
    if (request !== navigationRequest) return;
    current = { folder, note };
    void loadFiles(folder, request);
  }

  async function deleteNote(folder: string, name: string) {
    const label = noteLabel((notesByFolder[folder] ?? []).find((note) => note.name === name) ?? { name });
    if (!confirm(`Delete “${label}”? Its note content, review data, Pair conversation, and undo history will be removed. Project files will stay.`)) return;

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
        await tick();
      }

      await api.deleteNote(folder, name);
      await refresh(folder);

      if (selected) {
        const ix = await api.loadIndex();
        const next = ix.recent.find((recent) => recent.folder === folder);
        const fallback = (notesByFolder[folder] ?? []).find((note) => note.name !== name);
        const target = next ?? fallback;
        if (target) await openNote(folder, target.name);
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
    boot().catch((e) => { error = String(e); booted = true; });
    const un = listen<{ folder: string; name: string }>("note-changed", async ({ payload }) => {
      if (payload.folder !== projectFolder) return;
      await refresh(payload.folder).catch(() => {});
      if (current && current.folder === payload.folder && current.note.name === payload.name) {
        const disk = await api.openNote(payload.folder, payload.name).catch(() => null);
        if (disk) view?.reloadFromDisk(disk);
      }
    });
    return () => void un.then((f) => f());
  });
</script>

{#if !booted}
  <div class="loading" aria-label="Loading Pair"><span class="mark">↗</span><span>pair</span></div>
{:else if !projectFolder}
  <Launcher
    {recentFolders}
    {error}
    onOpenFolder={() => addFolder().catch((e) => (error = String(e)))}
    onOpenRecent={(folder) => openProject(folder).catch((e) => (error = String(e)))} />
{:else}
  <div class="app">
    <Sidebar
      folder={projectFolder}
      notes={notesByFolder[projectFolder] ?? []}
      current={current ? { folder: current.folder, name: current.note.name } : null}
      onAddFolder={() => addFolder().catch((e) => (error = String(e)))}
      onOpen={(f, n) => openNote(f, n).catch((e) => (error = String(e)))}
      onDelete={(f, n) => deleteNote(f, n)}
      onNew={(f, kind) => newNote(f, kind).catch((e) => (error = String(e)))}
      onSettings={() => (showSettings = true)}
      settingsOpen={showSettings}
      {files}
      {openFile}
      onOpenFile={(path) => (filePane = { path })} />

    <main>
      {#if error}<p class="error" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}
      {#if current && settings}
        <div class="split">
        {#key current.folder + "::" + current.note.name}
          {#if current.note.sidecar.kind === "code_review"}
            <svelte:boundary>
              <ReviewView bind:this={reviewView} folder={current.folder} bind:note={current.note} {settings} {pi}
                onSaved={titleStartedNote}
                interrupted={interrupted[noteKey(current.folder, current.note.name)] ?? null} />
              {#snippet failed(failure)}
                <div class="error" role="alert">Could not open this code review: {String(failure)}</div>
              {/snippet}
            </svelte:boundary>
          {:else}
            <NoteView bind:this={view} folder={current.folder} bind:note={current.note} {settings} {pi} {files} {openFile} onFilesChanged={filesChanged}
              onSaved={titleStartedNote}
              onOpenReference={(reference) => (filePane = { path: reference.path, reference: { ...reference } })}
              interrupted={interrupted[noteKey(current.folder, current.note.name)] ?? null} />
          {/if}
        {/key}
        {#if filePane}<FilePane folder={current.folder} path={filePane.path} reference={filePane.reference} tick={fileTick} onClose={() => (filePane = null)} />{/if}
        </div>
      {:else}
        <div class="bar" data-tauri-drag-region></div>
        <div class="empty">
          <p class="muted">Pick a note or start a new one.</p>
        </div>
      {/if}
    </main>
  </div>
{/if}

{#if projectFolder && showSettings && settings}
  <SettingsSheet {settings} {pi} onSave={saveSettings} onClose={() => (showSettings = false)} />
{/if}

<style>
  .loading { display: flex; width: 100vw; height: 100vh; align-items: center; justify-content: center; gap: 8px; color: var(--ink-soft); font-size: 13px; }
  .mark { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 7px; background: var(--ink); color: var(--bg); }
  .app { display: flex; height: 100vh; }
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .split { flex: 1; display: flex; min-height: 0; }
  .bar { height: 44px; flex: none; border-bottom: 1px solid var(--rule); }
  .empty { flex: 1; display: grid; place-content: center; text-align: center; gap: 12px; }
  .error { margin: 8px 20px; padding: 8px 12px; border-radius: 6px; background: var(--bad-soft); color: var(--bad); }
</style>
