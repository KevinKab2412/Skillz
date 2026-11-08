<script lang="ts" module>
  import type { Thread } from "$lib/api";

  export type MarginItem =
    | { key: string; kind: "thread"; want: number; thread: Thread }
    | { key: string; kind: "suggestion"; want: number; id: number; ins: string; del: string };
</script>

<script lang="ts">

  let {
    items,
    detached,
    active,
    onActivate,
    onReply,
    onResolve,
    onSuggestion,
  }: {
    items: MarginItem[];
    detached: Thread[];
    active: string | null;
    onActivate: (id: string | null) => void;
    onReply: (thread: Thread, text: string) => void;
    onResolve: (thread: Thread) => void;
    onSuggestion: (id: number, decision: "accept" | "reject", reason?: string) => void;
  } = $props();

  let heights = $state<Record<string, number>>({});
  let drafts = $state<Record<string, string>>({});
  let rejecting = $state<Record<number, string | undefined>>({});

  /** Stack cards in passage order without overlap. */
  const placed = $derived.by(() => {
    let y = 0;
    return [...items]
      .sort((a, b) => a.want - b.want)
      .map((it) => {
        const top = Math.max(it.want, y);
        y = top + (heights[it.key] ?? 90) + 10;
        return { ...it, top };
      });
  });

  function reply(t: Thread) {
    const text = (drafts[t.id] ?? "").trim();
    if (!text) return;
    drafts[t.id] = "";
    onReply(t, text);
  }
</script>

<div class="margin">
  {#each placed as it (it.key)}
    <div class="item" style={`top:${it.top}px`} bind:clientHeight={heights[it.key]}>
      {#if it.kind === "thread"}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="thread" class:active={active === it.thread.id} onclick={() => onActivate(it.thread.id)}>
          {#each it.thread.messages as m}
            <p class:agent={m.author === "agent"}><span class="who">{m.author === "agent" ? "pair" : "you"}</span>{m.text}</p>
          {/each}
          {#if active === it.thread.id}
            <textarea rows="2" placeholder="Reply or ask pair…" bind:value={drafts[it.thread.id]}
              onkeydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), reply(it.thread))}></textarea>
            <div class="row">
              <button class="btn" onclick={(e) => (e.stopPropagation(), reply(it.thread))}>Send</button>
              <button class="btn" onclick={(e) => (e.stopPropagation(), onResolve(it.thread))}>Resolve</button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="suggestion">
          <span class="who">pair suggests</span>
          {#if it.del}<p class="del">{it.del}</p>{/if}
          {#if it.ins}<p class="ins">{it.ins}</p>{/if}
          {#if rejecting[it.id] !== undefined}
            <input placeholder="Why not? (optional)" bind:value={rejecting[it.id]}
              onkeydown={(e) => e.key === "Enter" && onSuggestion(it.id, "reject", rejecting[it.id]?.trim() || undefined)} />
            <div class="row">
              <button class="btn" onclick={() => onSuggestion(it.id, "reject", rejecting[it.id]?.trim() || undefined)}>Reject</button>
              <button class="btn" onclick={() => (rejecting[it.id] = undefined)}>Back</button>
            </div>
          {:else}
            <div class="row">
              <button class="btn ok" onclick={() => onSuggestion(it.id, "accept")}>Accept</button>
              <button class="btn" onclick={() => (rejecting[it.id] = "")}>Reject…</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  {#if detached.length}
    <div class="detached" style={`top:${(placed.at(-1)?.top ?? 0) + (heights[placed.at(-1)?.key ?? ""] ?? 0) + 40}px`}>
      <h4>Detached</h4>
      <p class="muted small">Their passage was removed or rewritten.</p>
      {#each detached as t (t.id)}
        <div class="thread off">
          <p class="quote">“{t.anchor.quote.exact}”</p>
          {#each t.messages.slice(-1) as m}<p><span class="who">{m.author === "agent" ? "pair" : "you"}</span>{m.text}</p>{/each}
          <button class="btn" onclick={() => onResolve(t)}>Resolve</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .margin { position: relative; width: 300px; flex: none; }
  .item, .detached { position: absolute; left: 0; right: 0; transition: top 0.15s ease; }
  .thread, .suggestion { padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--rule); font-size: 13px; line-height: 1.45; cursor: default; }
  .thread.active { border-color: var(--accent); box-shadow: 0 2px 10px color-mix(in srgb, var(--ink) 8%, transparent); }
  .thread p, .suggestion p { margin: 0 0 6px; white-space: pre-wrap; }
  .who { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-faint); }
  p.agent .who, .suggestion .who { color: var(--accent); }
  .suggestion { border: 1px dashed var(--accent); }
  .del { text-decoration: line-through; color: var(--bad); }
  .ins { color: var(--ok); }
  textarea, input { width: 100%; border: 1px solid var(--rule); border-radius: 6px; padding: 6px; background: var(--bg); resize: none; margin-bottom: 6px; }
  .row { display: flex; gap: 6px; }
  h4 { margin: 0; font-size: 12px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  .small { font-size: 12px; margin: 2px 0 8px; }
  .off { margin-bottom: 8px; opacity: 0.8; }
  .quote { font-family: var(--serif); font-style: italic; color: var(--ink-soft); }
</style>
