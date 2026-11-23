<script lang="ts">
  import { folderLabel, type NoteKind, type NoteSummary } from "$lib/api";
  import FileTree, { buildTree } from "./FileTree.svelte";

  let {
    folders,
    rootFolder = null,
    notesByFolder,
    current,
    onAddFolder,
    onOpen,
    onDelete,
    onNew,
    onSettings,
    settingsOpen = false,
    files = [],
    openFile = null,
    onOpenFile = () => {},
  }: {
    folders: string[];
    rootFolder?: string | null;
    notesByFolder: Record<string, NoteSummary[]>;
    current: { folder: string; name: string } | null;
    onAddFolder: () => void;
    onOpen: (folder: string, name: string) => void;
    onDelete: (folder: string, name: string) => void;
    onNew: (folder: string, kind: NoteKind) => void;
    onSettings: () => void;
    settingsOpen?: boolean;
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
  <button class="folder-action" title="Open a project in its own window" onclick={onAddFolder}>
    <span class="folder-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg></span>
    <span class="folder-copy"><strong>Open folder</strong><small>Open in its own window</small></span>
  </button>
  <div class="content">
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
    {#if rootFolder}
      <section class="files">
        <header><span>Files</span></header>
        <div class="root-path">
          <span>Root directory</span>
          <code title={rootFolder}>{rootFolder}</code>
        </div>
        {#if files.length}
          <FileTree nodes={tree} open={openFile} {expanded} onOpen={onOpenFile} />
        {:else}
          <p class="muted empty">No files found</p>
        {/if}
      </section>
    {/if}
  </div>
  <div class="footer">
    <button class="settings" class:active={settingsOpen} onclick={onSettings}>
      <span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 13.5 1.3 1-1.3 2.3-1.6-.5a7.8 7.8 0 0 1-1.5.9l-.3 1.7h-2.7l-.4-1.7a7.8 7.8 0 0 1-1.6-.9l-1.5.5-1.4-2.3 1.3-1a7 7 0 0 1 0-1.8l-1.3-1 1.4-2.3 1.5.5a7.8 7.8 0 0 1 1.6-.9l.4-1.7H16l.3 1.7a7.8 7.8 0 0 1 1.5.9l1.6-.5 1.3 2.3-1.3 1a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1)"/></svg></span>
      <span>Settings</span>
    </button>
  </div>
</nav>

<style>
  .sidebar { display: flex; flex-direction: column; width: 232px; height: 100vh; flex: none; background: var(--sidebar); border-right: 1px solid var(--rule); padding: 0 10px 10px; overflow: hidden; }
  .top { height: 38px; }
  .folder-action { display: flex; width: 100%; min-height: 50px; align-items: center; gap: 10px; padding: 7px 9px; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); text-align: left; color: var(--ink); }
  .folder-action:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--rule)); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .folder-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 7px; background: var(--sidebar); color: var(--accent); }
  .folder-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.8; }
  .folder-copy { display: grid; gap: 2px; }
  .folder-copy strong { font-size: 12px; font-weight: 600; }
  .folder-copy small { color: var(--ink-faint); font-size: 10px; }
  .content { flex: 1; min-height: 0; margin-top: 14px; overflow-y: auto; }
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
  .root-path { display: grid; gap: 4px; margin: 9px 6px 8px; padding: 7px; border: 1px solid var(--rule); border-radius: 7px; background: var(--surface); }
  .root-path > span { color: var(--ink-faint); font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .root-path code { color: var(--ink-soft); font-size: 10px; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; }
  .footer { flex: none; margin-top: 8px; padding-top: 9px; border-top: 1px solid var(--rule); }
  .settings { display: flex; width: 100%; min-height: 36px; align-items: center; gap: 9px; padding: 5px 7px; border: 1px solid transparent; border-radius: 8px; text-align: left; color: var(--ink-soft); font-size: 12px; }
  .settings:hover, .settings:focus-visible, .settings.active { border-color: var(--rule); background: var(--surface); color: var(--ink); }
  .settings-icon { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 6px; background: var(--surface); color: var(--ink-faint); }
  .settings-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
  .settings:hover .settings-icon, .settings:focus-visible .settings-icon, .settings.active .settings-icon { color: var(--accent); }
</style>
