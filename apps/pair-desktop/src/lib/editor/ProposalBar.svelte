<script lang="ts">
  /** Accept / Reject (with optional reason) for one suggestion. Bubbles a `pair-proposal` DOM event. */
  let { id, label }: { id: number | string; label: string } = $props();
  let rejecting = $state(false);
  let reason = $state("");
  let el: HTMLDivElement;

  function send(decision: "accept" | "reject") {
    el.dispatchEvent(new CustomEvent("pair-proposal", { bubbles: true, detail: { id, decision, reason: reason.trim() || undefined } }));
  }
</script>

<div class="bar" bind:this={el} contenteditable="false">
  <span class="label">{label}</span>
  {#if rejecting}
    <input placeholder="Why not? (optional, goes to the agent)" bind:value={reason} onkeydown={(e) => e.key === "Enter" && send("reject")} />
    <button class="btn" onclick={() => send("reject")}>Reject</button>
    <button class="btn" onclick={() => (rejecting = false)}>Back</button>
  {:else}
    <button class="btn ok" onclick={() => send("accept")}>Accept</button>
    <button class="btn" onclick={() => (rejecting = true)}>Reject…</button>
  {/if}
</div>

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: -6px 0 14px; font-family: var(--sans); font-size: 13px; }
  .label { color: var(--accent); font-weight: 600; margin-right: auto; }
  input { flex: 1; min-width: 160px; padding: 4px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }
</style>
