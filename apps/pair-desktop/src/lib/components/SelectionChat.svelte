<script lang="ts">
  import type { ReviewChatContext, ReviewChatMessage } from "$lib/api";

  let { label, context, messages, output = "", busy = false, error = null, draft = $bindable(""), onSend, onClose }: {
    label: string;
    context: ReviewChatContext | null;
    messages: ReviewChatMessage[];
    output?: string;
    busy?: boolean;
    error?: string | null;
    draft?: string;
    onSend: () => void;
    onClose: () => void;
  } = $props();

  let scroller = $state<HTMLDivElement>();
  $effect(() => {
    void messages.length;
    void output;
    void busy;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });

  function send(event: Event) {
    event.preventDefault();
    if (context && draft.trim() && !busy) onSend();
  }
</script>

<aside class="chat-panel" aria-label={`${label} chat`}>
  <div class="chat-heading">
    <div><span class="chat-kicker">{label}</span><h2>Ask Pair</h2></div>
    <button class="chat-close" aria-label="Close chat" onclick={onClose}>×</button>
  </div>
  {#if context}
    <div class="chat-context">
      <strong>{context.path}</strong>
      <span>{context.location}</span>
      <pre>{context.selection || context.excerpt}</pre>
    </div>
  {/if}
  <div class="chat-messages" bind:this={scroller} aria-live="polite">
    {#if !messages.length && !output}
      <p class="chat-empty">{context?.source === "note" ? "Ask Pair about the highlighted text." : "Ask what the selected lines do, why they changed, or what behavior you should verify."}</p>
    {/if}
    {#each messages as message (message.id)}
      <div class:from-user={message.role === "user"} class="chat-message">
        <span>{message.role === "user" ? "You" : "Pair"}</span><p>{message.text}</p>
      </div>
    {/each}
    {#if output}
      <div class="chat-message"><span>Pair</span><p>{output}</p></div>
    {:else if busy}
      <div class="chat-wait"><span class="dot"></span>Pair is working on your question…</div>
    {/if}
    {#if error}<p class="chat-error" role="status">{error}</p>{/if}
  </div>
  <form class="chat-compose" onsubmit={send}>
    <textarea bind:value={draft} onkeydown={(event) => { if (event.key === "Enter" && !event.shiftKey) send(event); }}
      aria-label="Ask Pair about the selection" placeholder="Ask about this selection…" rows="3" disabled={busy}></textarea>
    <div><span>Enter to send · Shift + Enter for a new line</span><button class="btn primary" type="submit" disabled={!draft.trim() || busy || !context}>{busy ? "Thinking…" : "Send"}</button></div>
  </form>
</aside>

<style>
  .chat-panel { position: absolute; z-index: 15; top: 54px; right: 16px; bottom: 16px; display: flex; width: min(430px, calc(100% - 32px)); min-height: 260px; flex-direction: column; overflow: hidden; border: 1px solid var(--rule); border-radius: 12px; background: var(--surface); box-shadow: 0 16px 50px #0005; }
  .chat-heading { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 12px; border-bottom: 1px solid var(--rule); background: var(--sidebar); }
  .chat-kicker { color: var(--accent); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; }
  .chat-heading h2 { margin: 2px 0 0; font-family: var(--sans); font-size: 16px; font-weight: 600; }
  .chat-close { width: 28px; height: 28px; border-radius: 6px; color: var(--ink-faint); font-size: 20px; }
  .chat-close:hover { color: var(--ink); background: var(--surface); }
  .chat-context { display: grid; gap: 4px; padding: 11px 14px; border-bottom: 1px solid var(--rule); background: color-mix(in srgb, var(--mark) 28%, var(--surface)); }
  .chat-context strong { overflow: hidden; color: var(--ink); font-family: var(--mono); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .chat-context > span { color: var(--ink-faint); font-size: 10px; }
  .chat-context pre { max-height: 86px; overflow: auto; margin: 3px 0 0; color: var(--ink-soft); font-family: var(--mono); font-size: 10px; line-height: 1.5; white-space: pre-wrap; }
  .chat-messages { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 12px; overflow: auto; padding: 14px; }
  .chat-empty { max-width: 300px; margin: auto; color: var(--ink-faint); text-align: center; font-size: 12px; line-height: 1.55; }
  .chat-message { display: grid; gap: 4px; max-width: 92%; align-self: flex-start; }
  .chat-message.from-user { align-self: flex-end; }
  .chat-message > span { color: var(--ink-faint); font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  .chat-message p { margin: 0; padding: 9px 11px; border: 1px solid var(--rule); border-radius: 9px; color: var(--ink-soft); background: var(--sidebar); font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chat-message.from-user p { color: var(--ink); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
  .chat-wait { display: flex; align-items: center; gap: 8px; color: var(--ink-faint); font-size: 11px; }
  .chat-error { margin: 0; padding: 9px 10px; border-radius: 7px; color: var(--bad); background: var(--bad-soft); font-size: 11px; line-height: 1.45; }
  .chat-compose { display: grid; gap: 8px; padding: 11px; border-top: 1px solid var(--rule); background: var(--sidebar); }
  .chat-compose textarea { width: 100%; resize: vertical; box-sizing: border-box; padding: 9px; border: 1px solid var(--rule); border-radius: 7px; outline-color: var(--accent); color: var(--ink); background: var(--surface); font: 12px/1.45 var(--sans); }
  .chat-compose textarea::placeholder { color: var(--ink-faint); }
  .chat-compose > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .chat-compose > div > span { color: var(--ink-faint); font-size: 9px; }
  .btn.primary { padding: 6px 10px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); color: var(--ink); font-size: 12px; }
  .btn.primary:disabled { opacity: .5; }
  @media (max-width: 620px) { .chat-panel { top: 48px; right: 8px; bottom: 8px; width: calc(100% - 16px); } }
  @media print { .chat-panel { display: none; } }
</style>
