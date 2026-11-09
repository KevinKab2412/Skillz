<script lang="ts">
  /** A file edit, command or other tool call waiting for Kevin, drawn inline under its passage. */
  import type { Card } from "$lib/session.svelte";
  import { focusOnMount } from "$lib/focus";

  let { card, onDecide }: { card: Card; onDecide: (decision: "accept" | "reject", opts: { reason?: string; command?: string }) => void } = $props();
  // svelte-ignore state_referenced_locally
  let command = $state(String(card.input.command ?? ""));
  let rejecting = $state(false);
  let reason = $state("");

  const ask = $derived(
    card.kind === "command" ? "pair wants to run this" : card.kind === "file_edit" ? (card.tool === "write" ? "pair wants to write this file" : "pair wants to edit this file") : card.kind === "read_outside" ? "pair wants to read outside the project" : `pair wants to use ${card.tool}`,
  );
  const path = $derived(String(card.input.path ?? "").replace(/^@/, ""));
  const edits = $derived((card.input.edits as { oldText: string; newText: string }[] | undefined) ?? []);
  const lines = $derived.by((): { t: "a" | "d" | "c"; s: string }[] => {
    if (card.tool === "write") return String(card.input.content ?? "").split("\n").map((s) => ({ t: "a", s }));
    if (edits.length)
      return edits.flatMap((e, i) => [
        ...(i ? [{ t: "c" as const, s: "⋯" }] : []),
        ...e.oldText.split("\n").map((s) => ({ t: "d" as const, s })),
        ...e.newText.split("\n").map((s) => ({ t: "a" as const, s })),
      ]);
    return [];
  });
  const plus = $derived(lines.filter((l) => l.t === "a").length);
  const minus = $derived(lines.filter((l) => l.t === "d").length);
  const stop = (e: Event) => e.stopPropagation();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="card" class:done={card.status !== "pending"} onclick={stop}>
  <header>
    <span class="dot" class:working={card.status === "pending"}></span>
    {#if path}<b>{path}</b>{:else if card.kind === "command"}<b>terminal</b>{/if}
    {#if plus}<span class="plus">+{plus}</span>{/if}{#if minus}<span class="minus">−{minus}</span>{/if}
    <span class="ask">
      {#if card.status === "accepted"}<span class="good">Accepted{card.checkpoint ? ` · undo point #${card.checkpoint}` : ""}</span>
      {:else if card.status === "rejected"}<span class="no">Rejected{card.reason ? `: ${card.reason}` : ""}</span>
      {:else}{ask}{/if}
    </span>
  </header>

  {#if card.kind === "command"}
    {#if card.status === "pending"}
      <textarea class="cmd" rows={Math.min(6, command.split("\n").length)} bind:value={command} aria-label="Command (you can edit it before it runs)"></textarea>
    {:else}
      <pre class="cmd">{command}</pre>
    {/if}
  {:else if lines.length}
    <pre class="diff">{#each lines as l}<div class={l.t}>{l.t === "a" ? "+ " : l.t === "d" ? "- " : "  "}{l.s}</div>{/each}</pre>
  {:else}
    <pre class="diff">{JSON.stringify(card.input, null, 2)}</pre>
  {/if}

  {#if card.status === "pending"}
    <footer>
      {#if rejecting}
        <input use:focusOnMount placeholder="Why not? (optional, goes to pair)" bind:value={reason} onkeydown={(e) => e.key === "Enter" && onDecide("reject", { reason: reason.trim() || undefined })} />
        <button class="pill" onclick={() => (rejecting = false)}>Back</button>
        <button class="pill" onclick={() => onDecide("reject", { reason: reason.trim() || undefined })}>Reject</button>
      {:else}
        <button class="pill" onclick={() => (rejecting = true)}>Reject…</button>
        <button class="pill go" onclick={() => onDecide("accept", card.kind === "command" ? { command } : {})}>{card.kind === "command" ? "Run" : "Accept"}</button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .card { border: 1px solid var(--rule); border-radius: 10px; background: var(--bg); margin: 4px 0 10px; overflow: hidden; font: 13px var(--sans); }
  .card.done { opacity: 0.75; }
  header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--rule); color: var(--ink-faint); }
  b { font: 500 12px var(--mono); color: var(--ink); }
  .plus { color: var(--ok); } .minus { color: var(--bad); }
  .ask { margin-left: auto; text-align: right; }
  .good { color: var(--ok); } .no { color: var(--bad); }
  .diff, .cmd { margin: 0; font: 12.5px/1.6 var(--mono); max-height: 360px; overflow: auto; }
  .diff { padding: 8px 0; }
  .diff div { padding: 0 12px; white-space: pre; }
  .diff .a { background: var(--ok-soft); color: var(--ok); }
  .diff .d { background: var(--bad-soft); color: var(--bad); }
  .diff .c { color: var(--ink-faint); }
  .cmd { display: block; width: 100%; padding: 10px 12px; border: 0; background: none; white-space: pre-wrap; resize: vertical; outline: none; color: var(--ink); }
  footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; padding: 8px 12px; border-top: 1px solid var(--rule); }
  footer input { flex: 1; border: 0; border-bottom: 1px solid var(--rule); background: none; padding: 3px 0; outline: none; }
</style>
