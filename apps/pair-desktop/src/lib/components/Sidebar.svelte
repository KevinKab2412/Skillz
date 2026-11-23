<script lang="ts">
  import { folderLabel, type NoteKind, type NoteSummary } from "$lib/api";
  import FileTree, { buildTree } from "./FileTree.svelte";

  let {
    folders,
    notesByFolder,
    current,
    onAddFolder,
    onOpen,
    onDelete,
    onNew,
    onSettings,
    files = [],
    openFile = null,
    onOpenFile = () => {},
  }: {
    folders: string[];
    notesByFolder: Record<string, NoteSummary[]>;
    current: { folder: string; name: string } | null;
    onAddFolder: () => void;
    onOpen: (folder: string, name: string) => void;
    onDelete: (folder: string, name: string) => void;
    onNew: (folder: string, kind: NoteKind) => void;
    onSettings: () => void;
    files?: string[];
    openFile?: string | null;
    onOpenFile?: (path: string) => void;
  } = $props();

  const tree = $derived(buildTree(files));
  let expanded = $state<Record<string, boolean>>({});
  let newMenu = $state<string | null>(null);
  // Opening a file from elsewhere unfolds its folders.
  $effect(() => {
    if (!openFile) return;
    const parts = openFile.split("/");
    for (let i = 1; i < parts.length; i++) expanded[parts.slice(0, i).join("/")] = true;
  });
</script>

<nav class="sidebar" aria-label="Projects and notes">
  <div class="top" data-tauri-drag-region></div>
  {#each folders as folder (folder)}
    <section>
      <header>
        <span title={folder}>{folderLabel(folder)}</span>
        <div class="add-wrap">
          <button class="add" title={`Create in ${folderLabel(folder)}`} aria-label={`Create in ${folderLabel(folder)}`} aria-expanded={newMenu === folder} onclick={() => (newMenu = newMenu === folder ? null : folder)}>+</button>
          {#if newMenu === folder}
            <div class="new-menu">
              <button onclick={() => { newMenu = null; onNew(folder, "note"); }}>Note</button>
              <button onclick={() => { newMenu = null; onNew(folder, "code_review"); }}>Code review</button>
            </div>
          {/if}
        </div>
      </header>
      <ul>
        {#each notesByFolder[folder] ?? [] as n (n.name)}
          <li class="note-row">
            <button
              class="note"
              class:active={current?.folder === folder && current?.name === n.name}
              onclick={() => onOpen(folder, n.name)}><span>{n.name}</span>{#if n.kind === "code_review"}<span class="kind">Review</span>{/if}</button>
            <button class="delete-note" title="Delete note" aria-label={`Delete ${n.name}`} onclick={(event) => { event.stopPropagation(); onDelete(folder, n.name); }}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5v-1h4v1m-5.5 0 .6 8h5.8l.6-8M6.5 6.5v4m3-4v4" /></svg>
            </button>
          </li>
        {:else}
          <li class="muted empty">No notes yet</li>
        {/each}
      </ul>
    </section>
  {/each}
  {#if current && files.length}
    <section class="files">
      <header><span title={current.folder}>Files</span></header>
      <FileTree nodes={tree} open={openFile} {expanded} onOpen={onOpenFile} />
    </section>
  {/if}
  <button class="open" onclick={onAddFolder}>Open folder…</button>
  <button class="open" onclick={onSettings}>Settings</button>
</nav>

<style>
  .sidebar { width: 232px; flex: none; background: var(--sidebar); border-right: 1px solid var(--rule); padding: 0 10px 16px; overflow-y: auto; }
  .top { height: 38px; }
  section { margin-bottom: 18px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; font-size: 12px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  .add-wrap { position: relative; }
  .add { width: 20px; height: 20px; border-radius: 4px; color: var(--ink-faint); font-size: 16px; line-height: 1; }
  .add:hover { background: var(--rule); color: var(--ink); }
  .new-menu { position: absolute; z-index: 10; top: 22px; right: 0; width: 150px; padding: 4px; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 14%, transparent); }
  .new-menu button { display: block; width: 100%; padding: 7px 8px; border-radius: 5px; text-align: left; color: var(--ink-soft); font-size: 12px; }
  .new-menu button:hover { background: var(--sidebar); color: var(--ink); }
  ul { list-style: none; margin: 4px 0 0; padding: 0; }
  .note-row { display: flex; align-items: center; gap: 2px; border-radius: 6px; }
  li .note { display: flex; flex: 1; min-width: 0; align-items: center; gap: 6px; text-align: left; padding: 5px 8px; border-radius: 6px; white-space: nowrap; overflow: hidden; }
  li .note > span:first-child { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  li .note:hover { background: var(--rule); }
  li .note.active { background: var(--surface); box-shadow: 0 0 0 1px var(--rule); }
  .delete-note { display: grid; flex: none; width: 24px; height: 24px; place-items: center; border-radius: 5px; color: var(--ink-faint); opacity: 0; pointer-events: none; }
  .delete-note svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }
  .note-row:hover .delete-note, .note-row:focus-within .delete-note, .delete-note:focus-visible { opacity: 1; pointer-events: auto; }
  .delete-note:hover { color: var(--bad); background: var(--bad-soft); }
  @media (hover: none) { .delete-note { opacity: 1; pointer-events: auto; } }
  .kind { flex: none; padding: 1px 5px; border-radius: 4px; background: var(--rule); color: var(--ink); font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .empty { padding: 5px 8px; font-size: 13px; }
  .files { border-top: 1px solid var(--rule); padding-top: 12px; }
  .open { display: block; margin-top: 4px; padding: 6px 8px; color: var(--ink-soft); }
  .open:hover { color: var(--ink); }
</style>
