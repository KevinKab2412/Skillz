<script lang="ts">
  /** Static Mermaid fallback for diagrams the scene spec cannot express. Strict mode: no HTML, no clicks. */
  let { source }: { source: string } = $props();
  let svg = $state("");
  let error = $state<string | null>(null);
  let seq = 0;

  $effect(() => {
    const src = source;
    const id = `pair-mermaid-${Math.random().toString(36).slice(2)}-${++seq}`;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
        const out = await mermaid.render(id, src);
        svg = out.svg;
        error = null;
      })
      .catch((e) => (error = String(e?.message ?? e)));
  });
</script>

{#if error}
  <pre class="err">{error}</pre>
{:else}
  <!-- Mermaid output in strict mode is sanitised SVG. -->
  <div class="mermaid">{@html svg}</div>
{/if}

<style>
  .mermaid :global(svg) { max-width: 100%; height: auto; }
  .err { color: var(--bad); font-size: 12px; white-space: pre-wrap; }
</style>
