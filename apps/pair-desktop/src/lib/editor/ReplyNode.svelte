<script lang="ts">
  import type { NodeViewProps } from "@tiptap/core";
  import { NodeViewWrapper } from "svelte-tiptap";
  import ProposalBar from "./ProposalBar.svelte";

  let { node }: NodeViewProps = $props();
  // Agent text is shown as plain paragraphs: no HTML from the model ever reaches the DOM.
  const paragraphs = $derived(String(node.attrs.text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean));
  const pending = $derived(node.marks.find((m) => m.type.name === "insertion"));
</script>

<NodeViewWrapper class={pending ? "block-proposal" : ""}>
  <aside class="reply" contenteditable="false">
    <span class="who">pair</span>
    {#each paragraphs as p}<p>{p}</p>{/each}
  </aside>
  {#if pending}<ProposalBar id={pending.attrs.id} label="Add this reply to the note?" />{/if}
</NodeViewWrapper>

<style>
  .reply { margin: 14px 0; padding: 10px 16px 10px 14px; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent-soft) 60%, transparent); border-radius: 0 8px 8px 0; font-family: var(--serif); }
  .reply p { margin: 6px 0; white-space: pre-wrap; }
  .who { font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--accent); }
</style>
