<script lang="ts">
  /** The file Kevin opened from the tree, read-only beside the note. pair is told it is open. */
  import hljs from "highlight.js/lib/common";
  import { api, type FileText } from "$lib/api";
  import type { CodeReference } from "$lib/code-references";

  let { folder, path, reference, tick = 0, onClose }: {
    folder: string;
    path: string;
    reference?: CodeReference;
    tick?: number;
    onClose: () => void;
  } = $props();

  let file = $state<FileText | null>(null);
  let error = $state<string | null>(null);
  let viewport = $state<HTMLDivElement>();
  let firstCitedLine = $state<HTMLSpanElement>();

  $effect(() => {
    void tick;
    let canceled = false;
    file = null;
    error = null;
    api.readFile(folder, path).then(
      (f) => {
        if (!canceled) file = f;
      },
      (e) => {
        if (!canceled) error = String(e);
      },
    );
    return () => { canceled = true; };
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
  const lastLine = $derived(file?.text.endsWith("\n") ? lineCount - 1 : file?.text ? lineCount : 0);
  const visibleEnd = $derived(reference && reference.start <= lastLine ? Math.min(reference.end, lastLine) : null);
  const lineLabel = $derived(reference && (reference.start === reference.end ? `Line ${reference.start}` : `Lines ${reference.start}–${reference.end}`));

  $effect(() => {
    if (!reference || !viewport || !firstCitedLine) return;
    const line = firstCitedLine.getBoundingClientRect();
    const panel = viewport.getBoundingClientRect();
    viewport.scrollTop += line.top - panel.top - (viewport.clientHeight - line.height) / 2;
  });
</script>

<aside class="files-pane" aria-label={`File ${path}`}>
  <header>
    <span class="path" title={path}>{path}</span>
    {#if lineLabel}<span class="line-label">{lineLabel}</span>{/if}
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
    <div
      class="code"
      class:has-citation={visibleEnd !== null}
      bind:this={viewport}
      style:--citation-start={reference ? `${reference.start - 1}lh` : undefined}
      style:--citation-end={visibleEnd === null ? undefined : `${visibleEnd}lh`}
    >
      <pre class="gutter" aria-hidden="true">{#each { length: lineCount } as _, i}{#if visibleEnd !== null && i + 1 === reference?.start}<span bind:this={firstCitedLine}>{i + 1}</span>{:else}{i + 1}{/if}{"\n"}{/each}</pre>
      <pre class="src hljs">{@html html}</pre>
    </div>
    {#if reference && reference.end > lastLine}
      <p class="msg muted">{file.truncated ? "The citation extends beyond the displayed portion of this file." : "The current file ends before the cited lines are complete."}</p>
    {/if}
    {#if file.truncated}<p class="msg muted">Only the first 512 KB is shown.</p>{/if}
  {/if}
</aside>

<style>
  .files-pane { width: min(42vw, 560px); flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--rule); background: var(--surface); min-height: 0; }
  header { height: 44px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--rule); }
  .path { font: 500 12px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .ro { font-size: 12px; margin-left: auto; }
  .line-label { flex: none; color: var(--accent); font: 11px var(--mono); }
  .close { font-size: 18px; color: var(--ink-faint); width: 22px; }
  .close:hover { color: var(--ink); }
  .code { flex: 1; overflow: auto; display: flex; font: 12.5px/1.6 var(--mono); }
  pre { margin: 0; padding: 12px 0; }
  .gutter { text-align: right; padding-left: 12px; padding-right: 14px; color: var(--ink-faint); user-select: none; position: sticky; left: 0; background: var(--surface); }
  .src { flex: 1; padding-right: 16px; white-space: pre; color: var(--ink); }
  .has-citation pre {
    --highlight-start: calc(12px + var(--citation-start));
    --highlight-end: calc(12px + var(--citation-end));
    background-image: linear-gradient(to bottom, transparent var(--highlight-start), var(--mark) var(--highlight-start) var(--highlight-end), transparent var(--highlight-end));
  }
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
