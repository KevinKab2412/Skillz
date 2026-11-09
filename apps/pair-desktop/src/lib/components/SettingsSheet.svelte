<script lang="ts">
  import type { PiStatus, Settings } from "$lib/api";

  let { settings, pi, onSave, onClose }: { settings: Settings; pi: PiStatus | null; onSave: (s: Settings) => void; onClose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let draft = $state<Settings>({ ...settings });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="sheet" role="dialog" aria-label="Settings">
    <h3>Settings</h3>
    <label><input type="checkbox" bind:checked={draft.thinks_with_you} /> Thinks with you on for new notes</label>
    <label>Reading pace
      <select bind:value={draft.pace}><option value="normal">Normal (about 2 s pause)</option><option value="slow">Slow (about 4 s)</option></select></label>
    <label>Appearance
      <select bind:value={draft.appearance}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <label>Text size
      <select bind:value={draft.text_size}><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select></label>
    <label>Agent colour <input type="color" bind:value={draft.accent} /></label>
    <label>Default model for new notes
      <input placeholder="e.g. openai-codex/gpt-6-sol (empty: Pi's default)" value={draft.default_model ?? ""} oninput={(e) => (draft.default_model = e.currentTarget.value || null)} /></label>
    <label>Path to pi
      <input placeholder="Found through your login shell" value={draft.pi_path ?? ""} oninput={(e) => (draft.pi_path = e.currentTarget.value || null)} /></label>
    <p class="muted small">
      {#if pi?.path}Using {pi.path} · Pi {pi.version ?? "?"}{pi.expected && pi.version !== pi.expected ? ` (tested with ${pi.expected})` : ""}{:else}Pi not found.{/if}
      Sign in to ChatGPT or add an OpenRouter key in Pi itself (run <code>pi</code>, then <code>/login</code>); pair never stores credentials.
    </p>
    <div class="row-end">
      <button class="btn" onclick={onClose}>Cancel</button>
      <button class="btn primary" onclick={() => (onSave(draft), onClose())}>Save</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 30%, transparent); display: grid; place-items: center; z-index: 40; }
  .sheet { width: min(480px, 92vw); background: var(--surface); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
  h3 { margin: 0 0 4px; }
  label { display: flex; flex-direction: column; gap: 4px; color: var(--ink-soft); }
  label:has(input[type="checkbox"]) { flex-direction: row; align-items: center; gap: 6px; }
  select, input:not([type="checkbox"]):not([type="color"]) { padding: 5px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--bg); }
  .small { font-size: 12px; }
  .row-end { display: flex; justify-content: flex-end; gap: 8px; }
</style>
