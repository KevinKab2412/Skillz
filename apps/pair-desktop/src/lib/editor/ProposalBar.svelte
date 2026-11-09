<script lang="ts">
  /** Accept / Reject (with optional reason) for one suggestion. Bubbles a `pair-proposal` DOM event. */
  import { focusOnMount } from "$lib/focus";
  let { id, label }: { id: number | string; label: string } = $props();
  let rejecting = $state(false);
  let reason = $state("");
  let el: HTMLDivElement;

  function send(decision: "accept" | "reject") {
    el.dispatchEvent(new CustomEvent("pair-proposal", { bubbles: true, detail: { id, decision, reason: reason.trim() || undefined } }));
  }
</script>

<div class="bar" bind:this={el} contenteditable="false">
  <span class="dot working"></span>
  <span class="label">{label}</span>
  {#if rejecting}
    <input use:focusOnMount placeholder="Why not? (optional, goes to pair)" bind:value={reason} onkeydown={(e) => e.key === "Enter" && send("reject")} />
    <button class="pill" onclick={() => (rejecting = false)}>Back</button>
    <button class="pill" onclick={() => send("reject")}>Reject</button>
  {:else}
    <button class="pill" onclick={() => (rejecting = true)}>Reject…</button>
    <button class="pill go" onclick={() => send("accept")}>Accept</button>
  {/if}
</div>

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: 6px 0 14px; font-family: var(--sans); font-size: 13px; }
  .label { color: var(--ink-faint); margin-right: auto; }
  input { flex: 1; min-width: 160px; border: 0; border-bottom: 1px solid var(--rule); background: none; padding: 3px 0; outline: none; }
</style>
