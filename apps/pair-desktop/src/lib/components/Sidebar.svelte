<script lang="ts">
  import { folderLabel, type NoteSummary } from "$lib/api";
  import FileTree, { buildTree } from "./FileTree.svelte";

  let {
    folders,
    notesByFolder,
    current,
    onAddFolder,
    onOpen,
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
    onNew: (folder: string) => void;
    onSettings: () => void;
    files?: string[];
    openFile?: string | null;
    onOpenFile?: (path: string) => void;
  } = $props();

  const tree = $derived(buildTree(files));
  let expanded = $state<Record<string, boolean>>({});
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
        <button class="add" title="New note" aria-label={`New note in ${folderLabel(folder)}`} onclick={() => onNew(folder)}>+</button>
      </header>
      <ul>
        {#each notesByFolder[folder] ?? [] as n (n.name)}
          <li>
            <button
              class:active={current?.folder === folder && current?.name === n.name}
              onclick={() => onOpen(folder, n.name)}>{n.name}</button>
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
  .add { width: 20px; height: 20px; border-radius: 4px; color: var(--ink-faint); font-size: 16px; line-height: 1; }
  .add:hover { background: var(--rule); color: var(--ink); }
  ul { list-style: none; margin: 4px 0 0; padding: 0; }
  li button { width: 100%; text-align: left; padding: 5px 8px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  li button:hover { background: var(--rule); }
  li button.active { background: var(--surface); box-shadow: 0 0 0 1px var(--rule); }
  .empty { padding: 5px 8px; font-size: 13px; }
  .files { border-top: 1px solid var(--rule); padding-top: 12px; }
  .open { display: block; margin-top: 4px; padding: 6px 8px; color: var(--ink-soft); }
  .open:hover { color: var(--ink); }
</style>
