<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { api, type Note, type NoteSummary } from "$lib/api";

  let folders = $state<string[]>([]);
  let notesByFolder = $state<Record<string, NoteSummary[]>>({});
  let current = $state<{ folder: string; note: Note } | null>(null);
  let error = $state<string | null>(null);
  let lastSaved = "";
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  async function refresh(folder: string) {
    notesByFolder[folder] = await api.listNotes(folder);
  }

  async function loadFolders() {
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
    await flush();
    const note = await api.openNote(folder, name);
    lastSaved = note.markdown;
    current = { folder, note };
  }

  async function newNote(folder: string) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    let name = `note-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const taken = new Set((notesByFolder[folder] ?? []).map((n) => n.name));
    for (let i = 2; taken.has(name); i++) name = name.replace(/(-\d+)?$/, `-${i}`);
    const note = await api.createNote(folder, name);
    await refresh(folder);
    lastSaved = note.markdown;
    current = { folder, note };
  }

  function edited(markdown: string) {
    if (!current) return;
    current.note.markdown = markdown;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  async function flush() {
    clearTimeout(saveTimer);
    if (!current || current.note.markdown === lastSaved) return;
    const snapshot = $state.snapshot(current.note) as Note;
    await api.saveNote(current.folder, snapshot).catch((e) => (error = String(e)));
    lastSaved = snapshot.markdown;
  }

  onMount(() => {
    loadFolders().catch((e) => (error = String(e)));
    const un = listen<{ folder: string; name: string }>("note-changed", async ({ payload }) => {
      await refresh(payload.folder).catch(() => {});
      if (!current || current.folder !== payload.folder || current.note.name !== payload.name) return;
      const disk = await api.openNote(payload.folder, payload.name).catch(() => null);
      if (disk && disk.markdown !== lastSaved && disk.markdown !== current.note.markdown) {
        lastSaved = disk.markdown;
        current = { folder: payload.folder, note: disk };
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
    onNew={(f) => newNote(f).catch((e) => (error = String(e)))} />

  <main>
    <div class="bar" data-tauri-drag-region>
      {#if current}<span class="title">{current.note.name}</span>{/if}
    </div>
    {#if error}<p class="error" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}
    {#if current}
      {#key current.folder + current.note.name}
        <textarea
          class="plain"
          aria-label="Note"
          value={current.note.markdown}
          oninput={(e) => edited(e.currentTarget.value)}></textarea>
      {/key}
    {:else}
      <div class="empty">
        <p class="muted">{folders.length ? "Pick a note or start a new one." : "Open a project folder to start."}</p>
        {#if !folders.length}<button class="btn primary" onclick={addFolder}>Open folder…</button>{/if}
      </div>
    {/if}
  </main>
</div>

<style>
  .app { display: flex; height: 100vh; }
  main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .bar { height: 38px; flex: none; display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid var(--rule); }
  .title { font-weight: 600; color: var(--ink-soft); }
  .plain { flex: 1; border: 0; outline: none; resize: none; padding: 48px max(48px, calc(50% - 340px)); background: var(--bg); font-family: var(--serif); font-size: var(--text-size); line-height: 1.6; }
  .empty { flex: 1; display: grid; place-content: center; text-align: center; gap: 12px; }
  .error { margin: 8px 20px; padding: 8px 12px; border-radius: 6px; background: var(--bad-soft); color: var(--bad); }
</style>
