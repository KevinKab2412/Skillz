<script lang="ts" module>
  export type TreeNode = { name: string; path: string; dir: boolean; children: TreeNode[] };

  /** Builds a folder tree from relative paths; folders first, then files, each alphabetical. */
  export function buildTree(paths: string[]): TreeNode[] {
    const root: TreeNode = { name: "", path: "", dir: true, children: [] };
    for (const p of paths) {
      let node = root;
      const parts = p.split("/");
      parts.forEach((name, i) => {
        const dir = i < parts.length - 1;
        const path = parts.slice(0, i + 1).join("/");
        let child = node.children.find((c) => c.name === name && c.dir === dir);
        if (!child) node.children.push((child = { name, path, dir, children: [] }));
        node = child;
      });
    }
    const sort = (n: TreeNode) => {
      n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
      n.children.forEach(sort);
    };
    sort(root);
    return root.children;
  }
</script>

<script lang="ts">
  import Self from "./FileTree.svelte";

  let {
    nodes,
    open,
    expanded,
    onOpen,
    depth = 0,
  }: { nodes: TreeNode[]; open: string | null; expanded: Record<string, boolean>; onOpen: (path: string) => void; depth?: number } = $props();
</script>

<ul class:root={depth === 0}>
  {#each nodes as n (n.path + (n.dir ? "/" : ""))}
    <li>
      {#if n.dir}
        <button class="row dir" style={`padding-left:${8 + depth * 12}px`} onclick={() => (expanded[n.path] = !expanded[n.path])}>
          <span class="chev" class:down={expanded[n.path]} aria-hidden="true"></span>{n.name}
        </button>
        {#if expanded[n.path]}<Self nodes={n.children} {open} {expanded} {onOpen} depth={depth + 1} />{/if}
      {:else}
        <button class="row" class:active={open === n.path} style={`padding-left:${20 + depth * 12}px`} title={n.path} onclick={() => onOpen(n.path)}>{n.name}</button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .row { width: 100%; text-align: left; padding: 3px 8px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; color: var(--ink-soft); }
  .row:hover { background: var(--rule); color: var(--ink); }
  .row.active { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--rule); }
  .dir { color: var(--ink); }
  .chev { display: inline-block; width: 5px; height: 5px; margin: 0 7px 2px 0; border-right: 1.2px solid var(--ink-faint); border-bottom: 1.2px solid var(--ink-faint); transform: rotate(-45deg); transition: transform 0.12s; }
  .chev.down { transform: rotate(45deg); }
</style>
