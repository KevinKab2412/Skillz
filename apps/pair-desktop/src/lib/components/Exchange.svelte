<script lang="ts">
  /**
   * One thread under its passage: pair's replies in ink, Kevin's in the note's sans, folded to the
   * latest reply once it becomes a back-and-forth. Also shows what pair is doing for this thread
   * right now, and the approval cards its work produced. Text suggestions get a small bar instead.
   */
  import CardView from "./CardView.svelte";
  import ProposalBar from "$lib/editor/ProposalBar.svelte";
  import { visibleMessages, type ExchangeCtx } from "./exchange";
  import { focusOnMount } from "$lib/focus";

  /** Focus the reply box only when Kevin clicked Reply, not when the thread merely became active. */
  const focusIf = (el: HTMLElement, on: boolean) => {
    if (on) focusOnMount(el);
  };

  let { wkey, ctx, quoted = false }: { wkey: string; ctx: ExchangeCtx; quoted?: boolean } = $props();

  const kind = $derived(wkey.slice(0, 1));
  const id = $derived(wkey.slice(2));
  const thread = $derived(kind === "t" ? ctx.thread(id) : undefined);
  const suggestion = $derived(kind === "s" ? ctx.suggestion(Number(id)) : undefined);
  const cards = $derived(kind === "t" ? ctx.session.cards.filter((c) => c.threadId === id) : []);
  const act = $derived(kind === "t" && ctx.session.activity?.threadId === id ? ctx.session.activity : null);
  const waitingTurn = $derived(kind === "t" && !act && ctx.session.workingOn(id));
  const isActive = $derived(kind === "t" && ctx.active() === id);

  let open = $state(false);
  let draft = $state("");
  let replying = $state(false);
  const view = $derived(thread ? visibleMessages(thread.messages, open) : { shown: [], hidden: 0 });
  const paras = (t: string) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  function send() {
    const text = draft.trim();
    if (!text || !thread) return;
    draft = "";
    ctx.reply(thread, text);
  }
</script>

{#if thread && (thread.messages.length || act || waitingTurn || cards.length)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="ex" class:active={isActive} class:folded={view.hidden > 0 || (open && thread.messages.length > 2)} onclick={() => ctx.activate(id)}>
    <span class="hook" aria-hidden="true"></span>
    <div class="body">
      {#if quoted}<p class="quote">“{thread.anchor.quote.exact}”</p>{/if}
      {#if view.hidden}
        <button class="earlier" onclick={(e) => { e.stopPropagation(); open = true; }}>{view.hidden} earlier</button>
      {:else if open && thread.messages.length > 2}
        <button class="earlier" onclick={(e) => { e.stopPropagation(); open = false; }}>Hide earlier</button>
      {/if}
      <div class:older={open && thread.messages.length > 2}>
        {#each view.shown as m, i (i)}
          {#if m.author === "agent"}
            <div class="ink msg"><span class="dot"></span><div>{#each paras(m.text) as p}<p>{p}</p>{/each}</div></div>
          {:else}
            <div class="kevin msg">{m.text}</div>
          {/if}
        {/each}
      </div>

      {#if act}
        <div class="ink msg live">
          <span class="dot working"></span>
          <div>
            {#if act.text.trim()}{#each paras(act.text) as p}<p>{p}</p>{/each}{/if}
            {#if act.status !== "writing"}<p class="status">{act.status}…</p>{/if}
          </div>
        </div>
      {:else if waitingTurn}
        <div class="ink msg live"><span class="dot"></span><p class="status">waiting its turn…</p></div>
      {/if}

      {#each cards as card (card.requestId)}
        <CardView {card} onDecide={(d, o) => ctx.decideCard(card, d, o)} />
      {/each}

      {#if thread.messages.length && !act}
        {#if replying || isActive}
          <div class="reply-row">
            <input
              use:focusIf={replying}
              placeholder="Reply…"
              bind:value={draft}
              onkeydown={(e) => {
                if (e.key === "Enter") send();
                if (e.key === "Escape") replying = false;
              }} />
            <button class="link" onclick={(e) => { e.stopPropagation(); ctx.resolve(thread); }}>Resolve</button>
          </div>
        {:else}
          <div class="actions">
            <button class="link" onclick={(e) => { e.stopPropagation(); replying = true; ctx.activate(id); }}>Reply</button>
            <button class="link" onclick={(e) => { e.stopPropagation(); ctx.resolve(thread); }}>Resolve</button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{:else if suggestion}
  <div class="ex sugg">
    <span class="hook" aria-hidden="true"></span>
    <div class="body"><ProposalBar id={Number(id)} label="pair suggests this edit" /></div>
  </div>
{/if}

<style>
  .ex { position: relative; display: grid; grid-template-columns: 14px 1fr; margin: -0.5em 0 0.9em 4px; font-family: var(--sans); cursor: default; user-select: text; }
  /* The hook runs from under the passage to pair's first dot. */
  .hook { border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); border-bottom-left-radius: 9px; height: calc(0.75em + 4px); width: 11px; }
  .ex.folded .hook { height: calc(0.75em + 26px); }
  .ex.active .hook { border-color: var(--ink-soft); }
  .body { min-width: 0; }
  .quote { margin: 0 0 4px; font-size: 13px; color: var(--ink-faint); font-style: italic; }
  .msg { margin: 0 0 8px; }
  .ink { display: grid; grid-template-columns: 7px 1fr; column-gap: 12px; font-family: var(--serif); font-size: calc(var(--text-size) * 1.02); line-height: 1.5; color: var(--agent-ink); }
  .ink p { margin: 0 0 6px; white-space: pre-wrap; }
  .ink .dot { margin-top: 0.62em; }
  .kevin { font-size: calc(var(--text-size) * 0.9); line-height: 1.55; color: var(--ink); padding-left: 19px; }
  .older { border-left: 1px solid var(--rule); padding-left: 12px; margin-left: 2px; }
  .status { color: var(--ink-faint); font-style: italic; }
  .earlier, .link { font: 12px var(--sans); color: var(--ink-faint); padding: 0; }
  .earlier { display: block; margin: 2px 0 4px 19px; line-height: 16px; }
  .earlier:hover, .link:hover { color: var(--ink); }
  .actions { display: flex; gap: 12px; padding-left: 19px; opacity: 0; transition: opacity 0.15s; }
  .ex:hover .actions { opacity: 1; }
  .reply-row { display: flex; gap: 12px; align-items: center; padding-left: 19px; }
  .reply-row input { flex: 1; border: 0; border-bottom: 1px solid var(--rule); background: none; padding: 4px 0; font: 14px var(--sans); outline: none; }
  .reply-row input:focus { border-bottom-color: var(--ink-faint); }
  .sugg :global(.bar) { margin: 0; }
</style>
