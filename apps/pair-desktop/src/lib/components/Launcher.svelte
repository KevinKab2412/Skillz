<script lang="ts">
  import { folderLabel } from "$lib/api";

  let {
    recentFolders,
    error = null,
    worktreeRoot,
    onChooseWorktreeRoot,
    onOpenBranch,
    onOpenFolder,
    onOpenRecent,
    onClose,
  }: {
    recentFolders: string[];
    error?: string | null;
    worktreeRoot?: string | null;
    onChooseWorktreeRoot: () => Promise<void>;
    onOpenBranch: (branch: string) => Promise<void>;
    onOpenFolder: () => void;
    onOpenRecent: (folder: string) => void;
    onClose?: () => void;
  } = $props();

  let query = $state("");
  let branch = $state("");
  let preparing = $state(false);
  let choosing = $state(false);
  let branchError = $state<string | null>(null);
  const search = $derived(query.trim().toLowerCase());
  const filtered = $derived(recentFolders
    .filter((folder) => `${folderLabel(folder)} ${folder}`.toLowerCase().includes(search))
    .slice(0, 4));

  async function chooseRoot() {
    choosing = true;
    branchError = null;
    try {
      await onChooseWorktreeRoot();
    } catch (failure) {
      branchError = String(failure);
    } finally {
      choosing = false;
    }
  }

  async function openBranch(event: SubmitEvent) {
    event.preventDefault();
    if (!worktreeRoot || !branch.trim() || preparing || choosing) return;
    preparing = true;
    branchError = null;
    try {
      await onOpenBranch(branch.trim());
    } catch (failure) {
      branchError = String(failure);
    } finally {
      preparing = false;
    }
  }
</script>

<div class="launcher" class:embedded={!!onClose}>
  {#if !onClose}
    <header class="topbar" data-tauri-drag-region>
      <span class="brand-mark" aria-hidden="true">↗</span>
      <span class="brand">pair</span>
    </header>
  {/if}
  <section class="picker" aria-label="Choose a directory">
    {#if onClose}<button type="button" class="launcher-close" aria-label="Close folder launcher" onclick={onClose} disabled={preparing || choosing}>×</button>{/if}
    <div class="eyebrow">PROJECTS</div>
    <h1>Choose a directory</h1>
    <p class="intro">Each directory opens in its own window with its own notes and files.</p>

    <button class="choose" onclick={onOpenFolder} disabled={preparing || choosing}>
      <span class="choose-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg></span>
      <span>Open a directory…</span>
    </button>

    <details class="branch-setup">
      <summary>Open a branch…</summary>
      <form onsubmit={openBranch}>
        <div class="branch-root">
          {#if worktreeRoot}<code title={worktreeRoot}>{worktreeRoot}</code>{/if}
          <button type="button" class="branch-button" disabled={preparing || choosing} onclick={chooseRoot}>{worktreeRoot ? "Change V1 folder…" : "Choose V1 folder…"}</button>
        </div>
        <label for="worktree-branch">Branch name</label>
        <div class="branch-input">
          <input id="worktree-branch" type="text" placeholder="feature/my-change" bind:value={branch} disabled={preparing} spellcheck={false} />
          <button type="submit" class="branch-button" disabled={!worktreeRoot || !branch.trim() || preparing || choosing}>Open branch</button>
        </div>
        {#if preparing}<p class="branch-status" role="status">Preparing the worktree and dependencies…</p>{/if}
        {#if branchError}<p class="error branch-error" role="alert">{branchError}</p>{/if}
      </form>
    </details>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if recentFolders.length}
      <div class="recent-heading"><h2>Recent directories</h2><span>{filtered.length}</span></div>
      <div class="search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
        <input type="search" bind:value={query} placeholder="Find a directory" aria-label="Find a recent directory" />
        {#if query}<button class="clear" aria-label="Clear search" onclick={() => (query = "")}>×</button>{/if}
      </div>
      <ul class="recent-list">
        {#each filtered as folder (folder)}
          <li>
            <button class="recent" title={`Open ${folder}`} onclick={() => onOpenRecent(folder)} disabled={preparing || choosing}>
              <span class="folder-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M2.5 5.5h5l1.7 1.8h8.3v8.2H2.5z"/><path d="M2.5 5.5v-1h5l1.7 1.8"/></svg></span>
              <span class="folder-copy"><strong>{folderLabel(folder)}</strong><code>{folder}</code></span>
              <svg class="open-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 14 14 6M7 6h7v7"/></svg>
            </button>
          </li>
        {:else}
          <li class="no-results">No matching directories.</li>
        {/each}
      </ul>
    {/if}
  </section>
  {#if !onClose}<footer>One project per window</footer>{/if}
</div>

<style>
  .launcher { min-height: 100vh; background: var(--bg); color: var(--ink); }
  .launcher.embedded { min-height: 0; }
  .embedded .picker { position: relative; width: 100%; margin: 0; box-sizing: border-box; box-shadow: none; }
  .launcher-close { position: absolute; right: 15px; top: 13px; width: 28px; height: 28px; border-radius: 6px; color: var(--ink-soft); font-size: 21px; }
  .launcher-close:hover { background: var(--sidebar); color: var(--ink); }
  /* The native window buttons sit over the left edge of the launcher. */
  .topbar { display: flex; height: 44px; align-items: center; gap: 8px; padding: 0 22px 0 88px; border-bottom: 1px solid var(--rule); color: var(--ink-soft); }
  .brand-mark { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 6px; background: var(--ink); color: var(--bg); font-size: 14px; }
  .brand { font-size: 13px; font-weight: 600; letter-spacing: .01em; }
  .picker { width: min(100% - 40px, 520px); margin: 10vh auto 56px; padding: 26px; border: 1px solid var(--rule); border-radius: 14px; background: var(--surface); box-shadow: 0 18px 55px color-mix(in srgb, var(--ink) 8%, transparent); }
  .eyebrow { color: var(--ink-faint); font-size: 10px; font-weight: 650; letter-spacing: .09em; }
  h1 { margin: 8px 0 6px; font-size: 23px; font-weight: 600; letter-spacing: -.02em; }
  .intro { margin: 0 0 20px; color: var(--ink-soft); font-size: 13px; line-height: 1.5; }
  .choose { display: flex; width: 100%; height: 44px; align-items: center; justify-content: center; gap: 9px; border: 1px solid var(--ink); border-radius: 8px; background: var(--ink); color: var(--bg); font-size: 13px; font-weight: 550; }
  .choose:hover { opacity: .88; }
  .branch-setup { margin-top: 10px; border: 1px solid var(--rule); border-radius: 8px; }
  .branch-setup summary { padding: 10px 12px; cursor: pointer; font-size: 13px; color: var(--ink-soft); }
  .branch-setup summary:hover { color: var(--ink); }
  .branch-setup form { display: grid; gap: 7px; padding: 0 12px 12px; }
  .branch-setup label { font-size: 11px; color: var(--ink-soft); }
  .branch-root, .branch-input { display: flex; align-items: center; gap: 8px; }
  .branch-root { flex-wrap: wrap; margin-bottom: 4px; }
  .branch-root code { min-width: 0; overflow-wrap: anywhere; color: var(--ink-faint); font: 11px var(--mono); }
  .branch-input input { flex: 1; min-width: 0; padding: 7px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--bg); color: var(--ink); font: 12px var(--mono); }
  .branch-button { flex: none; padding: 7px 8px; border: 1px solid var(--rule); border-radius: 6px; color: var(--ink-soft); font-size: 11px; }
  .branch-button:hover:not(:disabled) { border-color: var(--line); color: var(--ink); }
  .branch-status { margin: 0; color: var(--ink-soft); font-size: 12px; }
  .branch-error { white-space: pre-wrap; }
  button:disabled { opacity: .5; cursor: default; }
  .choose-icon { display: grid; width: 20px; height: 20px; place-items: center; }
  .choose-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.7; }
  .recent-heading { display: flex; align-items: center; justify-content: space-between; margin: 22px 1px 9px; }
  h2 { margin: 0; color: var(--ink-soft); font-size: 11px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; }
  .recent-heading > span { color: var(--ink-faint); font: 11px var(--mono); }
  .search { display: flex; height: 34px; align-items: center; gap: 8px; padding: 0 9px; border: 1px solid var(--rule); border-radius: 7px; background: var(--bg); color: var(--ink-faint); }
  .search svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.5; }
  .search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 12px; }
  .search input::placeholder { color: var(--ink-faint); }
  .clear { color: var(--ink-faint); font-size: 17px; line-height: 1; }
  .recent-list { display: grid; gap: 4px; max-height: 300px; margin: 8px 0 0; padding: 0; overflow-y: auto; list-style: none; }
  .recent { display: flex; width: 100%; min-width: 0; align-items: center; gap: 10px; padding: 8px; border: 1px solid transparent; border-radius: 8px; text-align: left; }
  .recent:hover, .recent:focus-visible { border-color: var(--rule); background: var(--bg); }
  .folder-icon { display: grid; flex: none; width: 30px; height: 30px; place-items: center; border: 1px solid var(--rule); border-radius: 7px; background: var(--surface); color: var(--accent); }
  .folder-icon svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }
  .folder-copy { display: grid; flex: 1; min-width: 0; gap: 3px; }
  .folder-copy strong { overflow: hidden; color: var(--ink); font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .folder-copy code { overflow: hidden; color: var(--ink-faint); font: 10px var(--mono); text-overflow: ellipsis; white-space: nowrap; }
  .open-icon { width: 16px; height: 16px; flex: none; fill: none; stroke: var(--ink-faint); stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.4; }
  .no-results { padding: 12px 9px; color: var(--ink-faint); font-size: 12px; }
  .error { margin: 12px 0 0; padding: 8px 10px; border-radius: 7px; background: var(--bad-soft); color: var(--bad); font-size: 12px; overflow-wrap: anywhere; }
  footer { color: var(--ink-faint); font-size: 11px; text-align: center; }
  @media (max-width: 560px) { .picker { margin-top: 5vh; padding: 20px; } }
</style>
