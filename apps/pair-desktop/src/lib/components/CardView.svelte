<script lang="ts">
  import type { Card } from "$lib/session.svelte";

  let { card, onDecide }: { card: Card; onDecide: (decision: "accept" | "reject", opts: { reason?: string; command?: string }) => void } = $props();
  // svelte-ignore state_referenced_locally
  let command = $state(String(card.input.command ?? ""));
  let rejecting = $state(false);
  let reason = $state("");

  const title = $derived(
    card.kind === "command" ? "Run a command" : card.kind === "file_edit" ? (card.tool === "write" ? "Write a file" : "Edit a file") : card.kind === "read_outside" ? "Read outside the project" : `Use ${card.tool}`,
  );
  const path = $derived(String(card.input.path ?? ""));
  const edits = $derived((card.input.edits as { oldText: string; newText: string }[] | undefined) ?? []);
</script>

<div class="card" class:done={card.status !== "pending"}>
  <header>
    <span class="kind">{title}</span>
    {#if path}<code class="path">{path}</code>{/if}
    {#if card.status === "accepted"}<span class="state ok">Accepted{card.checkpoint ? ` · undo point ${card.checkpoint}` : ""}</span>{/if}
    {#if card.status === "rejected"}<span class="state bad">Rejected{card.reason ? `: ${card.reason}` : ""}</span>{/if}
  </header>

  {#if card.kind === "command"}
    {#if card.status === "pending"}
      <textarea class="cmd" rows={Math.min(6, command.split("\n").length)} bind:value={command} aria-label="Command (you can edit it before it runs)"></textarea>
    {:else}
      <pre class="cmd">{command}</pre>
    {/if}
    <p class="cwd muted">in {String(card.input.cwd ?? "the project folder")}</p>
  {:else if card.tool === "write"}
    <pre class="diff">{#each String(card.input.content ?? "").split("\n").slice(0, 60) as l}<span class="add">+ {l}</span>{"\n"}{/each}</pre>
  {:else if edits.length}
    <pre class="diff">{#each edits as e}{#each e.oldText.split("\n") as l}<span class="del">- {l}</span>{"\n"}{/each}{#each e.newText.split("\n") as l}<span class="add">+ {l}</span>{"\n"}{/each}{"\n"}{/each}</pre>
  {:else}
    <pre class="diff">{JSON.stringify(card.input, null, 2)}</pre>
  {/if}

  {#if card.status === "pending"}
    <footer>
      {#if rejecting}
        <input placeholder="Why not? (optional, goes to the agent)" bind:value={reason} onkeydown={(e) => e.key === "Enter" && onDecide("reject", { reason: reason.trim() || undefined })} />
        <button class="btn" onclick={() => onDecide("reject", { reason: reason.trim() || undefined })}>Reject</button>
        <button class="btn" onclick={() => (rejecting = false)}>Back</button>
      {:else}
        <button class="btn ok" onclick={() => onDecide("accept", card.kind === "command" ? { command } : {})}>{card.kind === "command" ? "Run" : "Accept"}</button>
        <button class="btn" onclick={() => (rejecting = true)}>Reject…</button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .card { border: 1px dashed var(--accent); border-radius: 10px; padding: 10px 12px; background: var(--surface); margin: 8px 0; font-size: 13px; }
  .card.done { border-style: solid; border-color: var(--rule); opacity: 0.85; }
  header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .kind { font-weight: 600; }
  .path { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
  .state { margin-left: auto; font-size: 12px; }
  .ok { color: var(--ok); }
  .bad { color: var(--bad); }
  .cmd { width: 100%; font-family: var(--mono); font-size: 12px; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--bg); margin: 0; white-space: pre-wrap; resize: vertical; }
  .cwd { font-size: 11px; margin: 4px 0 0; }
  .diff { font-family: var(--mono); font-size: 12px; max-height: 260px; overflow: auto; background: var(--bg); padding: 6px 8px; border-radius: 6px; margin: 0; white-space: pre; }
  .add { color: var(--ok); }
  .del { color: var(--bad); }
  footer { display: flex; gap: 8px; margin-top: 10px; }
  footer input { flex: 1; padding: 4px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }
</style>
