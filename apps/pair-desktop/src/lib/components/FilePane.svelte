<script lang="ts">
  /** The file Kevin opened from the tree, read-only beside the note. pair is told it is open. */
  import hljs from "highlight.js/lib/common";
  import { api, type FileText } from "$lib/api";

  let { folder, path, tick = 0, onClose }: { folder: string; path: string; tick?: number; onClose: () => void } = $props();

  let file = $state<FileText | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    void tick;
    const p = path;
    error = null;
    api.readFile(folder, p).then(
      (f) => {
        if (p === path) file = f;
      },
      (e) => (error = String(e)),
    );
  });

  // highlight.js escapes the source it is given, so its output is safe to render as HTML.
  const html = $derived.by(() => {
    if (!file || file.binary) return "";
    const ext = path.split(".").pop() ?? "";
    const lang = hljs.getLanguage(ext) ? ext : undefined;
    try {
      return lang ? hljs.highlight(file.text, { language: lang }).value : hljs.highlightAuto(file.text).value;
    } catch {
      return hljs.highlight(file.text, { language: "plaintext" }).value;
    }
  });
  const lineCount = $derived(file ? file.text.split("\n").length : 0);
</script>

<aside class="files-pane" aria-label={`File ${path}`}>
  <header>
    <span class="path" title={path}>{path}</span>
    <span class="muted ro">read-only</span>
    <button class="close" aria-label="Close file" onclick={onClose}>×</button>
  </header>
  {#if error}
    <p class="msg bad">{error}</p>
  {:else if !file}
    <p class="msg muted">Opening…</p>
  {:else if file.binary}
    <p class="msg muted">This file is not text.</p>
  {:else}
    <div class="code">
      <pre class="gutter" aria-hidden="true">{#each { length: lineCount } as _, i}{i + 1}{"\n"}{/each}</pre>
      <pre class="src hljs">{@html html}</pre>
    </div>
    {#if file.truncated}<p class="msg muted">Only the first 512 KB is shown.</p>{/if}
  {/if}
</aside>

<style>
  .files-pane { width: min(42vw, 560px); flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--rule); background: var(--surface); min-height: 0; }
  header { height: 44px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--rule); }
  .path { font: 500 12px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .ro { font-size: 12px; margin-left: auto; }
  .close { font-size: 18px; color: var(--ink-faint); width: 22px; }
  .close:hover { color: var(--ink); }
  .code { flex: 1; overflow: auto; display: flex; font: 12.5px/1.6 var(--mono); }
  pre { margin: 0; padding: 12px 0; }
  .gutter { text-align: right; padding-left: 12px; padding-right: 14px; color: var(--ink-faint); user-select: none; position: sticky; left: 0; background: var(--surface); }
  .src { padding-right: 16px; white-space: pre; color: var(--ink); }
  .msg { padding: 14px; margin: 0; font-size: 13px; }
  .bad { color: var(--bad); }
  /* Quiet token colours that sit on the paper background in both themes. */
  .src :global(.hljs-keyword), .src :global(.hljs-built_in), .src :global(.hljs-type) { color: #8a4b2a; }
  .src :global(.hljs-string), .src :global(.hljs-regexp) { color: #3f6f45; }
  .src :global(.hljs-number), .src :global(.hljs-literal) { color: #7a5aa6; }
  .src :global(.hljs-comment) { color: var(--ink-faint); font-style: italic; }
  .src :global(.hljs-title), .src :global(.hljs-function) { color: #2f5d8a; }
  .src :global(.hljs-attr), .src :global(.hljs-property) { color: #6b5d2f; }
  :global(:root[data-theme="dark"]) .src :global(.hljs-keyword), :global(:root[data-theme="dark"]) .src :global(.hljs-built_in) { color: #e0a27c; }
  :global(:root[data-theme="dark"]) .src :global(.hljs-string) { color: #9ccc9f; }
  :global(:root[data-theme="dark"]) .src :global(.hljs-title) { color: #8fb8e0; }
  :global(:root[data-theme="dark"]) .src :global(.hljs-number) { color: #c3a6ea; }
</style>
