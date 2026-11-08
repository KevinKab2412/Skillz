<script lang="ts">
  import type { NoteSession } from "$lib/session.svelte";
  import CardView from "./CardView.svelte";

  let {
    session,
    onAddToNote,
    onClose,
  }: { session: NoteSession; onAddToNote: (text: string) => void; onClose: () => void } = $props();
  let draft = $state("");
  let list: HTMLDivElement;

  function send() {
    const text = draft.trim();
    if (!text) return;
    draft = "";
    void session.ask("chat", { request: text });
  }

  $effect(() => {
    session.chat.length;
    queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));
  });
</script>

<aside class="chat" aria-label="Note chat">
  <header>
    <span>Chat about this note</span>
    <button aria-label="Close chat" onclick={onClose}>×</button>
  </header>
  <div class="list" bind:this={list}>
    {#each session.chat as item, i (i)}
      {#if item.type === "kevin"}
        <p class="kevin">{item.text}</p>
      {:else if item.type === "agent"}
        <div class="agent">
          <p>{item.text}{#if !item.done}<span class="cursor">▍</span>{/if}</p>
          {#if item.done && item.text.trim()}
            <button class="add" onclick={() => onAddToNote(item.text)}>Add to note</button>
          {/if}
        </div>
      {:else if item.type === "card"}
        <CardView card={item.card} onDecide={(d, o) => session.decideCard(item.card, d, o)} />
      {:else}
        <p class="notice muted">{item.text}</p>
      {/if}
    {:else}
      <p class="muted empty">Ask about the whole note or the project. Changes still come as proposals.</p>
    {/each}
  </div>
  <form onsubmit={(e) => (e.preventDefault(), send())}>
    <textarea rows="2" placeholder={session.running ? "pair is working… your message will queue" : "Ask pair…"} bind:value={draft}
      onkeydown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}></textarea>
  </form>
</aside>

<style>
  .chat { width: 340px; flex: none; border-left: 1px solid var(--rule); display: flex; flex-direction: column; background: var(--sidebar); min-height: 0; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; font-weight: 600; color: var(--ink-soft); border-bottom: 1px solid var(--rule); }
  header button { font-size: 18px; color: var(--ink-faint); }
  .list { flex: 1; overflow-y: auto; padding: 12px 14px; }
  .kevin { margin: 10px 0; padding: 8px 10px; border-radius: 10px; background: var(--surface); border: 1px solid var(--rule); white-space: pre-wrap; }
  .agent p { margin: 10px 0 4px; font-family: var(--serif); font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
  .cursor { color: var(--accent); }
  .add { font-size: 12px; color: var(--accent); }
  .notice { font-size: 12px; }
  .empty { font-size: 13px; }
  form { padding: 10px; border-top: 1px solid var(--rule); }
  textarea { width: 100%; resize: none; border: 1px solid var(--rule); border-radius: 8px; padding: 8px; background: var(--surface); }
</style>
