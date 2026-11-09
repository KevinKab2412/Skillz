<script lang="ts">
  import type { NodeViewProps } from "@tiptap/core";
  import { NodeViewWrapper } from "svelte-tiptap";
  import DiagramView from "$lib/diagram/DiagramView.svelte";
  import { parse } from "$pi/diagram-spec";
  import ProposalBar from "./ProposalBar.svelte";

  let { node }: NodeViewProps = $props();
  const parsed = $derived(parse(node.attrs.spec));
  const pending = $derived(node.marks.find((m) => m.type.name === "insertion"));
</script>

<NodeViewWrapper class={pending ? "block-proposal" : ""} data-drag-handle>
  {#if "spec" in parsed}
    <DiagramView spec={parsed.spec} />
  {:else}
    <div class="broken">
      <strong>This diagram can't be drawn.</strong>
      <ul>{#each parsed.errors as e}<li>{e}</li>{/each}</ul>
    </div>
  {/if}
  {#if pending}<ProposalBar id={pending.attrs.id} label="Add this diagram?" />{/if}
</NodeViewWrapper>

<style>
  .broken { margin: 14px 0; padding: 10px 14px; border-radius: 8px; background: var(--bad-soft); color: var(--bad); font-size: 13px; }
  .broken ul { margin: 6px 0 0; padding-left: 18px; }
</style>
