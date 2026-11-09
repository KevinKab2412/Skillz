<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import NoteView from "$lib/components/NoteView.svelte";
  import SettingsSheet from "$lib/components/SettingsSheet.svelte";
  import FilePane from "$lib/components/FilePane.svelte";
  import { agent, api, noteKey, settingsApi, type Note, type NoteSummary, type PiStatus, type Settings } from "$lib/api";

  let folders = $state<string[]>([]);
  let notesByFolder = $state<Record<string, NoteSummary[]>>({});
  let current = $state<{ folder: string; note: Note } | null>(null);
  let error = $state<string | null>(null);
  let settings = $state<Settings | null>(null);
  let pi = $state<PiStatus | null>(null);
  let interrupted = $state<Record<string, string>>({});
  let showSettings = $state(false);
  let view = $state<NoteView>();
  let files = $state<string[]>([]);
  let filesFolder: string | null = null;
  let openFile = $state<string | null>(null);
  let fileTick = $state(0);

  async function loadFiles(folder: string) {
    if (filesFolder !== folder) openFile = null;
    filesFolder = folder;
    files = await api.listFiles(folder).catch(() => []);
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
    if (last && folders.includes(last.folder)) await openNote(last.folder, last.name).catch(() => {});
  }

  async function addFolder() {
    const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
    if (typeof picked !== "string") return;
    folders = (await api.addFolder(picked)).folders;
    await api.watchFolder(picked);
    await refresh(picked);
  }

  async function openNote(folder: string, name: string) {
    const note = await api.openNote(folder, name);
    current = { folder, note };
    void loadFiles(folder);
  }

  async function newNote(folder: string) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    let name = `note-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const taken = new Set((notesByFolder[folder] ?? []).map((n) => n.name));
    for (let i = 2; taken.has(name); i++) name = name.replace(/(-\d+)?$/, `-${i}`);
    const note = await api.createNote(folder, name);
    await refresh(folder);
    current = { folder, note };
    void loadFiles(folder);
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
    onNew={(f) => newNote(f).catch((e) => (error = String(e)))}
    onSettings={() => (showSettings = true)}
    {files}
    {openFile}
    onOpenFile={(p) => (openFile = p)} />

  <main>
    {#if error}<p class="error" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}
    {#if current && settings}
      <div class="split">
      {#key current.folder + "::" + current.note.name}
        <NoteView bind:this={view} folder={current.folder} bind:note={current.note} {settings} {pi} {files} {openFile} onFilesChanged={filesChanged}
          interrupted={interrupted[noteKey(current.folder, current.note.name)] ?? null} />
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
