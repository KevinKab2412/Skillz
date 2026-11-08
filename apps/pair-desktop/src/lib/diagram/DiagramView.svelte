<script lang="ts">
  import { onDestroy } from "svelte";
  import { frames, type DiagramSpec, type SceneSpec } from "$pi/diagram-spec";
  import { centre, layout } from "./layout";
  import MermaidView from "./MermaidView.svelte";
  import DiagramView from "./DiagramView.svelte";

  let { spec, large = false }: { spec: DiagramSpec; large?: boolean } = $props();

  const scene = $derived(spec.kind === "mermaid" ? null : (spec as SceneSpec));
  const all = $derived(scene ? frames(scene) : []);
  const geo = $derived(scene ? layout(scene) : null);
  let step = $state(0);
  let enlarged = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const frame = $derived(all[Math.min(step, all.length - 1)]);
  const hidden = $derived(new Set(frame?.hidden ?? []));
  const changed = $derived(new Set(frame?.changed ?? []));
  const focus = $derived(new Set((frame?.focus ?? []).flatMap((r) => expand(r))));

  function expand(ref: string): string[] {
    const m = /^(\w[\w-]*)\.(r|c)(\d+)$/.exec(ref);
    if (!m || !geo) return [ref];
    const i = m[3];
    return geo.boxes.filter((b) => b.kind === "cell" && (m[2] === "r" ? b.ref.startsWith(`${m[1]}[${i},`) : b.ref.startsWith(`${m[1]}[`) && b.ref.endsWith(`,${i}]`))).map((b) => b.ref);
  }

  function go(n: number) {
    stopReplay();
    step = Math.max(0, Math.min(all.length - 1, n));
  }

  function replay() {
    stopReplay();
    step = 0;
    timer = setInterval(() => {
      if (step >= all.length - 1) stopReplay();
      else step += 1;
    }, 1400);
  }

  function stopReplay() {
    clearInterval(timer);
    timer = undefined;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(step + 1);
    else if (e.key === "ArrowLeft") go(step - 1);
    else if (e.key === "Escape" && enlarged) enlarged = false;
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  onDestroy(stopReplay);

  function path(from: string, to: string): string | null {
    if (!geo) return null;
    const a = centre(geo, from);
    const b = centre(geo, to);
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - Math.min(40, Math.abs(b.x - a.x) / 4 + 12);
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  }

  function edge(from: string, to: string): string | null {
    if (!geo) return null;
    const a = geo.boxes.find((b) => b.ref === from);
    const b = geo.boxes.find((b) => b.ref === to);
    if (!a || !b) return null;
    if (Math.abs(a.y - b.y) > a.h) return `M${a.x + a.w / 2},${a.y + a.h} L${b.x + b.w / 2},${b.y}`;
    return `M${a.x + a.w},${a.y + a.h / 2} L${b.x},${b.y + b.h / 2}`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<figure class="diagram" class:large tabindex="0" onkeydown={onKey} aria-label={`Diagram: ${spec.title}`} contenteditable="false">
  <figcaption class="title">{spec.title}</figcaption>

  {#if spec.kind === "mermaid"}
    <MermaidView source={spec.source} />
    <p class="static muted">Static diagram (no steps)</p>
  {:else if geo && frame}
    <svg viewBox={`0 0 ${geo.width} ${geo.height}`} width={large ? undefined : Math.min(geo.width, 640)} role="img" aria-label={frame.caption}>
      <defs>
        <marker id="pair-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)" />
        </marker>
        <marker id="pair-arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {#each geo.links as l (l.from + l.to)}
        {#if !hidden.has(l.from) && !hidden.has(l.to)}
          {@const d = edge(l.from, l.to)}
          {#if d}<path {d} class="link" marker-end="url(#pair-arrow)" />{/if}
        {/if}
      {/each}
      {#each geo.boxes as b (b.ref)}
        {#if !hidden.has(b.ref)}
          <g class={`box ${b.kind}`} class:changed={changed.has(b.ref)} class:focus={focus.has(b.ref)} data-ref={b.ref}>
            {#if b.kind === "label"}
              <text x={b.x + b.w / 2} y={b.y + b.h / 2}>{b.ref.split(":").slice(1).join(":")}</text>
            {:else if b.kind === "text"}
              <text class="eq" x={b.x} y={b.y + b.h / 2}>{frame.values[b.ref] ?? ""}</text>
            {:else}
              <rect x={b.x + 1} y={b.y + 1} width={b.w - 2} height={b.h - 2} rx={b.kind === "node" ? 8 : 2} />
              <text x={b.x + b.w / 2} y={b.y + b.h / 2}>{frame.values[b.ref] ?? ""}</text>
            {/if}
          </g>
        {/if}
      {/each}
      {#each frame.arrows as a, i (i)}
        {@const d = path(a.from, a.to)}
        {#if d}<path {d} class="arrow" marker-end="url(#pair-arrow-accent)" />{/if}
      {/each}
    </svg>
    <p class="caption" aria-live="polite">{frame.caption}</p>
    <ol class="print-only steps">{#each all as f}<li>{f.caption}</li>{/each}</ol>
    <div class="controls">
      <button aria-label="Previous step" disabled={step === 0} onclick={() => go(step - 1)}>‹</button>
      <span class="count">{step + 1}/{all.length}</span>
      <button aria-label="Next step" disabled={step === all.length - 1} onclick={() => go(step + 1)}>›</button>
      <button class="text-btn" onclick={replay}>Replay</button>
      {#if !large}<button class="text-btn" onclick={() => (enlarged = true)}>See it larger</button>{/if}
    </div>
  {/if}
</figure>

{#if enlarged}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay" onclick={(e) => e.target === e.currentTarget && (enlarged = false)}>
    <div class="sheet">
      <button class="close" aria-label="Close" onclick={() => (enlarged = false)}>×</button>
      <DiagramView {spec} large={true} />
    </div>
  </div>
{/if}

<style>
  .diagram { margin: 18px 0; padding: 16px 18px 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--surface); font-family: var(--sans); outline: none; user-select: none; }
  .diagram:focus-visible { box-shadow: 0 0 0 2px var(--accent-soft); }
  .diagram.large { border: 0; margin: 0; }
  .diagram.large svg { width: 100%; height: auto; max-height: 70vh; }
  .title { font-family: var(--serif); font-size: 15px; font-weight: 600; margin-bottom: 10px; }
  svg { display: block; max-width: 100%; height: auto; overflow: visible; }
  .box rect { fill: var(--bg); stroke: var(--rule); stroke-width: 1.2; transition: fill 0.35s, stroke 0.35s; }
  .box.node rect { stroke: var(--ink-faint); }
  .box text { font-size: 13px; fill: var(--ink); text-anchor: middle; dominant-baseline: central; font-family: var(--mono); }
  .box.label text { fill: var(--ink-faint); font-size: 11px; }
  .box.text text.eq { text-anchor: start; font-family: var(--serif); font-size: 15px; }
  .box.changed rect { fill: var(--accent-soft); }
  .box.focus rect { stroke: var(--accent); stroke-width: 2.4; }
  .link { fill: none; stroke: var(--ink-faint); stroke-width: 1.2; }
  .arrow { fill: none; stroke: var(--accent); stroke-width: 1.8; }
  .caption { margin: 10px 0 6px; font-family: var(--serif); font-size: 15px; color: var(--ink-soft); min-height: 1.4em; }
  .controls { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-soft); }
  .controls button { min-width: 26px; height: 26px; border-radius: 6px; }
  .controls button:hover:not(:disabled) { background: var(--rule); }
  .controls button:disabled { opacity: 0.35; cursor: default; }
  .text-btn { padding: 0 8px; }
  .count { font-variant-numeric: tabular-nums; }
  .static { font-size: 12px; margin: 6px 0 0; }
  .overlay { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 35%, transparent); display: grid; place-items: center; z-index: 50; }
  .sheet { position: relative; width: min(1100px, 92vw); max-height: 92vh; overflow: auto; background: var(--surface); border-radius: 14px; padding: 22px; }
  .close { position: absolute; right: 14px; top: 10px; font-size: 22px; color: var(--ink-faint); }
</style>
