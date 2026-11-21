<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { agent, api, noteKey, type AgentEvent, type Note, type PiStatus, type ReviewDiff, type ReviewFile, type ReviewSection, type ReviewState, type Settings } from "$lib/api";
  import { buildGuidePrompt, parseGuide } from "$lib/review-guide";

  let {
    folder,
    note = $bindable(),
    settings,
    pi,
    interrupted = null,
  }: {
    folder: string;
    note: Note;
    settings: Settings;
    pi: PiStatus | null;
    interrupted?: string | null;
  } = $props();

  let branches = $state<string[]>([]);
  let base = $state("");
  let head = $state("");
  let diff = $state<ReviewDiff | null>(null);
  let loadingBranches = $state(true);
  let loadingDiff = $state(false);
  let guideBusy = $state(false);
  let guideOutput = $state("");
  let guideError = $state<string | null>(null);
  let error = $state<string | null>(null);
  let hideReviewed = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let unlisten: (() => void) | null = null;
  let disposed = false;

  const key = $derived(noteKey(folder, note.name));
  const emptyReview = (): ReviewState => ({ base_branch: null, head_branch: null, base_commit: null, head_commit: null, reviewed_files: [], guide: null });
  const reviewState = () => (note.sidecar.review ??= emptyReview());
  const reviewed = (path: string) => reviewState().reviewed_files.includes(path);
  const sections = (): ReviewSection[] => {
    if (!diff) return [];
    const guide = reviewState().guide?.sections;
    return guide?.length
      ? guide
      : [{
          id: "changed-files",
          title: "Read the change",
          summary: "Start with the behavior this branch changes. Expand each file and follow the hunks in order.",
          focus: "What new behavior does this branch introduce, and what existing behavior must stay the same?",
          files: diff.files.map((file) => file.path),
          suggestions: [],
        }];
  };
  const shownFiles = (section: ReviewSection) => section.files.map((path) => diff?.files.find((file) => file.path === path)).filter((file): file is ReviewFile => !!file && (!hideReviewed || !reviewed(file.path)));
  const reviewedCount = () => diff?.files.filter((file) => reviewed(file.path)).length ?? 0;
  const shortCommit = (commit: string) => commit.slice(0, 8);

  async function saveReview() {
    await api.saveSidecar(folder, note.name, $state.snapshot(note.sidecar) as Note["sidecar"]).catch((e) => (error = String(e)));
  }

  async function loadBranches() {
    loadingBranches = true;
    error = null;
    try {
      const result = await api.reviewBranches(folder);
      branches = result.branches;
      base = reviewState().base_branch ?? branches.find((branch) => /(^|\/)main$|(^|\/)master$/.test(branch)) ?? branches[0] ?? "";
      head = reviewState().head_branch ?? result.current ?? branches.find((branch) => branch !== base) ?? "";
      if (reviewState().base_branch && reviewState().head_branch) await loadDiff();
    } catch (e) {
      error = String(e);
    } finally {
      loadingBranches = false;
    }
  }

  async function loadDiff() {
    if (!base || !head) {
      error = "Choose a base branch and the branch you want to review.";
      return;
    }
    loadingDiff = true;
    error = null;
    guideError = null;
    try {
      const next = await api.reviewDiff(folder, base, head);
      const state = reviewState();
      const sameRevision = state.base_commit === next.base_commit && state.head_commit === next.head_commit;
      if (!sameRevision) {
        state.reviewed_files = [];
        state.guide = null;
        guideOutput = "";
      }
      state.base_branch = base;
      state.head_branch = head;
      state.base_commit = next.base_commit;
      state.head_commit = next.head_commit;
      diff = next;
      expanded = next.files.length ? { [next.files[0].path]: true } : {};
      await saveReview();
    } catch (e) {
      diff = null;
      error = String(e);
    } finally {
      loadingDiff = false;
    }
  }

  async function toggleReviewed(path: string) {
    const state = reviewState();
    state.reviewed_files = reviewed(path) ? state.reviewed_files.filter((item) => item !== path) : [...state.reviewed_files, path];
    await saveReview();
  }

  function toggleDiff(path: string) {
    expanded[path] = !expanded[path];
  }

  function goToSuggestion(path: string) {
    expanded[path] = true;
    requestAnimationFrame(() => document.getElementById(`review-file-${encodeURIComponent(path)}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function draftGuide() {
    if (!diff || guideBusy) return;
    if (!pi?.path) {
      guideError = "Pair cannot find Pi. Set its path in Settings before asking for a guide.";
      return;
    }
    guideBusy = true;
    guideOutput = "";
    guideError = null;
    const sessionId = note.sidecar.session.id ?? crypto.randomUUID();
    note.sidecar.session.id = sessionId;
    await saveReview();
    try {
      await agent.ask(folder, note.name, sessionId, note.sidecar.model ?? settings.default_model, buildGuidePrompt(diff));
    } catch (e) {
      guideBusy = false;
      guideError = String(e);
    }
  }

  async function onAgentEvent(event: AgentEvent) {
    if (event.key !== key) return;
    const record = event.record;
    if (record.type === "pair_started" && guideBusy) {
      guideOutput = "";
    } else if (record.type === "message_update" && guideBusy) {
      const message = record.assistantMessageEvent;
      if (message?.type === "text_delta") guideOutput += String(message.delta ?? "");
    } else if (record.type === "pair_error" && guideBusy) {
      guideBusy = false;
      guideError = String(record.error ?? "Pair could not draft a guide.");
    } else if (record.type === "pair_exited" && guideBusy) {
      guideBusy = false;
      guideError = "Pair stopped before finishing the guide. Reload the diff and try again.";
    } else if (record.type === "pair_settled" && guideBusy) {
      guideBusy = false;
      try {
        reviewState().guide = parseGuide(guideOutput, diff?.files.map((file) => file.path) ?? []);
        await saveReview();
      } catch (e) {
        guideError = `Pair's reply could not be read as a guide: ${String(e)}`;
      }
    }
  }

  onMount(() => {
    loadBranches();
    listen<AgentEvent>("agent-event", ({ payload }) => void onAgentEvent(payload)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
  });

  onDestroy(() => {
    disposed = true;
    unlisten?.();
    if (guideBusy) void agent.close(folder, note.name).catch(() => {});
  });
</script>

<div class="review-view">
  <header class="bar" data-tauri-drag-region>
    <span class="brand"><span class="mark">↗</span> Code review</span>
    <span class="repo" title={folder}>{folder.split("/").filter(Boolean).at(-1) ?? folder}</span>
    {#if diff}<span class="summary">{diff.total_files} files · <b>+{diff.files.reduce((n, file) => n + file.additions, 0)}</b> <i>−{diff.files.reduce((n, file) => n + file.deletions, 0)}</i></span>{/if}
    <div class="bar-right">
      {#if diff}<span class="progress">{reviewedCount()} / {diff.files.length} reviewed{#if diff.files.length < diff.total_files} · {diff.total_files} total{/if}</span>{/if}
      <button class="quiet" onclick={() => (hideReviewed = !hideReviewed)}>{hideReviewed ? "Show reviewed" : "Hide reviewed"}</button>
    </div>
  </header>

  {#if interrupted}
    <p class="banner">Pair was interrupted while working on this review. <span>{interrupted}</span></p>
  {/if}
  {#if error}<p class="banner bad" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}

  <div class="scroller">
    <div class="content">
      <section class="intro">
        <p class="eyebrow">A review you lead</p>
        <h1>Follow the change, one story at a time.</h1>
        <p class="lede">Choose a branch and its base. Pair can suggest a route through the behavior and flag places to look; you read each diff and decide what holds.</p>
        <div class="target">
          <label>Base <select aria-label="Base branch" bind:value={base} disabled={loadingBranches || guideBusy}>
            {#each branches as branch}<option value={branch}>{branch}</option>{/each}
          </select></label>
          <span class="arrow">←</span>
          <label>Review <select aria-label="Branch to review" bind:value={head} disabled={loadingBranches || guideBusy}>
            {#each branches as branch}<option value={branch}>{branch}</option>{/each}
          </select></label>
          <button class="btn primary" onclick={loadDiff} disabled={loadingBranches || loadingDiff || guideBusy || !base || !head}>{loadingDiff ? "Loading…" : diff ? "Refresh diff" : "Load diff"}</button>
        </div>
        {#if diff}
          <div class="commit-line"><code>{shortCommit(diff.base_commit)}</code> → <code>{shortCommit(diff.head_commit)}</code> · merge base <code>{shortCommit(diff.merge_base)}</code></div>
        {/if}
        {#if diff?.truncated}<p class="limit">This review is large. Pair’s guide may use partial diff context; inspect every file in the list yourself.</p>{/if}
      </section>

      {#if loadingBranches}
        <div class="empty">Reading local Git branches…</div>
      {:else if !diff}
        <div class="empty">Load a branch comparison to start your review.</div>
      {:else if !diff.files.length}
        <div class="empty">These branches have no committed changes to review.</div>
      {:else}
        <div class="guide-actions">
          <div><strong>Review guide</strong><p>Pair groups related changes into a behavioral walkthrough. Suggestions stay attached to the section they discuss.</p></div>
          <button class="btn" onclick={draftGuide} disabled={guideBusy || !diff}>{guideBusy ? "Pair is reading the diff…" : reviewState().guide ? "Refresh guide with Pair" : "Draft guide with Pair"}</button>
        </div>
        {#if guideError}<div class="pair-error" role="status">{guideError}{#if guideOutput}<pre>{guideOutput}</pre>{/if}</div>{/if}
        {#if guideBusy}<div class="pair-working"><span class="dot"></span>Pair is reading the supplied diff. You can keep reviewing while it works.</div>{/if}

        {#each sections() as section, sectionIndex (section.id)}
          {@const files = shownFiles(section)}
          <section class="guide-section">
            <div class="guide-copy">
              <div class="section-number">{String(sectionIndex + 1).padStart(2, "0")} / {String(sections().length).padStart(2, "0")}</div>
              <h2>{section.title}</h2>
              {#if section.summary}<p class="section-summary">{section.summary}</p>{/if}
              {#if section.focus}<p class="focus"><span>Ask yourself</span>{section.focus}</p>{/if}

              {#if section.suggestions.length}
                <div class="suggestions">
                  <div class="suggestion-label"><span class="spark">✳</span> Pair's suggestions <span>verify in the diff</span></div>
                  {#each section.suggestions as suggestion, i (`${suggestion.path}:${suggestion.line ?? ""}:${i}`)}
                    <button class="suggestion" onclick={() => goToSuggestion(suggestion.path)}>
                      <span class="suggestion-meta">{suggestion.severity?.replaceAll("_", " ") ?? "check"} · {suggestion.path}{suggestion.line ? `:${suggestion.line}` : ""}</span>
                      <strong>{suggestion.summary}</strong>
                      {#if suggestion.rationale}<span>{suggestion.rationale}</span>{/if}
                      {#if suggestion.next_check}<span class="next-check">Look for: {suggestion.next_check}</span>{/if}
                    </button>
                  {/each}
                </div>
              {/if}

          <div class="section-files">
                {#each section.files as path (path)}
                  {@const file = diff.files.find((item) => item.path === path)}
                  {#if file && (!hideReviewed || !reviewed(path))}
                    <div class="file-row">
                      <button class="file-select" onclick={() => { expanded[path] = true; document.getElementById(`review-file-${encodeURIComponent(path)}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                        <span class="file-name">{path.split("/").at(-1)}</span><span class="file-dir">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "root"}</span>
                      </button>
                      <span class="counts"><b>+{file.additions}</b>{#if file.deletions}<i>−{file.deletions}</i>{/if}</span>
                      <label class="check" title="Mark this file reviewed"><input type="checkbox" checked={reviewed(path)} onchange={() => toggleReviewed(path)} />Reviewed</label>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>

            <div class="diffs">
              {#each files as file (file.path)}
                <article class="diff-file" id={`review-file-${encodeURIComponent(file.path)}`}>
                  <div class="diff-head">
                    <button class="disclosure" aria-expanded={!!expanded[file.path]} onclick={() => toggleDiff(file.path)}>
                      <span class="chevron">{expanded[file.path] ? "▾" : "▸"}</span><strong>{file.path.split("/").at(-1)}</strong><span class="file-dir">{file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "root"}</span>
                    </button>
                    <span class="counts"><b>+{file.additions}</b>{#if file.deletions}<i>−{file.deletions}</i>{/if}</span>
                    <span class="status">{file.status === "A" ? "Added" : file.status === "D" ? "Deleted" : "Changed"}</span>
                  </div>
                  {#if expanded[file.path]}
                    {#if file.binary}
                      <p class="binary">Binary file changed. The text diff is unavailable.</p>
                    {:else}
                      <pre class="patch">{#each file.patch.split("\n") as line, lineIndex (`${lineIndex}-${line.slice(0, 16)}`)}<span class:added={line.startsWith("+") && !line.startsWith("+++")} class:removed={line.startsWith("-") && !line.startsWith("---")} class:hunk={line.startsWith("@@")} class:meta={line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")}>{line || " "}</span>{/each}</pre>
                      {#if file.truncated}<p class="truncated">Diff excerpt reached the display limit. Continue in the repository or use a smaller branch comparison.</p>{/if}
                    {/if}
                  {/if}
                </article>
              {:else}
                <p class="all-reviewed">All files in this section are marked reviewed.</p>
              {/each}
            </div>
          </section>
        {/each}
        <p class="closing">Pair's suggestions are a starting point. Check every claim against the diff and your own understanding.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .review-view { flex: 1; display: flex; min-width: 0; min-height: 0; flex-direction: column; background: var(--bg); }
  .bar { height: 44px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 20px; border-bottom: 1px solid var(--rule); color: var(--ink-faint); font-size: 12px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 600; }
  .mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; color: var(--accent); background: var(--mark); font-size: 14px; }
  .repo { color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .summary { white-space: nowrap; }
  .summary b, .counts b { color: var(--ok); font-weight: 500; }
  .summary i, .counts i { color: var(--bad); font-style: normal; }
  .bar-right { margin-left: auto; display: flex; align-items: center; gap: 16px; white-space: nowrap; }
  .progress { color: var(--ink-soft); }
  .quiet { color: var(--ink-faint); font-size: 12px; }
  .quiet:hover { color: var(--ink); }
  .scroller { flex: 1; overflow: auto; }
  .content { width: min(1420px, 100%); margin: 0 auto; padding: 36px 38px 70px; box-sizing: border-box; }
  .intro { max-width: 940px; margin: 0 auto 34px; }
  .eyebrow, .section-number { color: var(--ink-faint); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
  h1 { margin: 6px 0 8px; font-family: var(--serif); font-size: clamp(25px, 3vw, 34px); font-weight: 500; letter-spacing: -.025em; }
  .lede { max-width: 710px; margin: 0; color: var(--ink-soft); line-height: 1.55; font-size: 14px; }
  .target { display: flex; align-items: end; gap: 10px; margin-top: 22px; }
  .target label { display: grid; gap: 5px; color: var(--ink-soft); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  select { min-width: 180px; max-width: 320px; padding: 8px 28px 8px 10px; border: 1px solid var(--rule); border-radius: 7px; background: var(--surface); color: var(--ink); font-size: 13px; text-transform: none; letter-spacing: 0; }
  .arrow { padding-bottom: 7px; color: var(--ink-soft); }
  .btn { padding: 8px 11px; border: 1px solid var(--rule); border-radius: 7px; color: var(--ink-soft); background: var(--surface); font-size: 12px; white-space: nowrap; }
  .btn:hover:not(:disabled) { border-color: var(--line); color: var(--ink); }
  .btn:disabled { opacity: .55; cursor: default; }
  .commit-line { margin-top: 9px; color: var(--ink-faint); font-size: 11px; }
  code { font-family: var(--mono); }
  .commit-line code { color: var(--ink-soft); }
  .limit { margin: 8px 0 0; color: var(--bad); font-size: 12px; }
  .empty { margin: 60px auto; color: var(--ink-faint); text-align: center; font-family: var(--serif); font-size: 18px; }
  .guide-actions { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin: 0 auto 20px; max-width: 1330px; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 9px; background: var(--sidebar); }
  .guide-actions strong { font-size: 13px; }
  .guide-actions p { margin: 4px 0 0; color: var(--ink-faint); font-size: 12px; }
  .pair-working, .pair-error { max-width: 1330px; margin: 0 auto 14px; padding: 10px 13px; border-radius: 8px; background: var(--sidebar); color: var(--ink-soft); font-size: 12px; }
  .pair-working { display: flex; align-items: center; gap: 9px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: pulse 1.3s ease-in-out infinite; }
  .pair-error { color: var(--bad); background: var(--bad-soft); }
  .pair-error pre { max-height: 200px; overflow: auto; white-space: pre-wrap; font-family: var(--mono); font-size: 11px; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
  .guide-section { display: grid; grid-template-columns: minmax(270px, .8fr) minmax(0, 1.7fr); gap: 28px; max-width: 1330px; margin: 0 auto; padding: 30px 0 36px; border-bottom: 1px solid var(--rule); scroll-margin: 30px; }
  .guide-copy { min-width: 0; }
  .section-number { margin-bottom: 8px; }
  h2 { margin: 0 0 10px; font-family: var(--serif); font-size: 22px; font-weight: 500; letter-spacing: -.015em; }
  .section-summary { margin: 0 0 14px; color: var(--ink-soft); line-height: 1.55; font-size: 13px; }
  .focus { display: grid; gap: 4px; margin: 0 0 18px; padding-left: 10px; border-left: 2px solid var(--line); color: var(--ink); font-family: var(--serif); font-size: 14px; line-height: 1.45; }
  .focus span { color: var(--ink-soft); font-family: var(--sans); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .suggestions { margin: 18px 0; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--rule)); border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--mark) 35%, var(--surface)); }
  .suggestion-label { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--rule); color: var(--ink); font-size: 11px; font-weight: 600; }
  .spark { color: var(--accent); }
  .suggestion-label span:last-child { margin-left: auto; color: var(--ink-faint); font-size: 10px; font-weight: 400; }
  .suggestion { display: grid; width: 100%; gap: 5px; padding: 10px; text-align: left; color: var(--ink-soft); border-bottom: 1px solid var(--rule); font-size: 12px; line-height: 1.45; }
  .suggestion:last-child { border-bottom: 0; }
  .suggestion:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .suggestion strong { color: var(--ink); font-weight: 550; }
  .suggestion-meta { color: var(--accent); font-family: var(--mono); font-size: 10px; }
  .next-check { color: var(--ink-faint); }
  .section-files { display: grid; gap: 5px; margin-top: 18px; }
  .file-row { display: flex; align-items: center; min-width: 0; gap: 8px; padding: 7px 8px; border: 1px solid color-mix(in srgb, var(--rule) 75%, transparent); border-radius: 7px; background: var(--surface); font-size: 11px; }
  .file-select { display: flex; align-items: baseline; min-width: 0; gap: 7px; flex: 1; text-align: left; }
  .file-select:hover .file-name { color: var(--accent); }
  .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .file-dir { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-faint); }
  .counts { flex: none; display: flex; gap: 5px; font-family: var(--mono); font-size: 10px; }
  .check { display: inline-flex; align-items: center; gap: 4px; flex: none; color: var(--ink-faint); font-size: 10px; cursor: pointer; }
  .check input { accent-color: var(--accent); margin: 0; }
  .diffs { min-width: 0; display: grid; align-content: start; gap: 8px; }
  .diff-file { min-width: 0; overflow: hidden; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); scroll-margin: 26px; }
  .diff-head { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 0 10px; background: var(--sidebar); }
  .disclosure { display: flex; align-items: center; min-width: 0; min-height: 38px; flex: 1; gap: 7px; text-align: left; font-size: 12px; }
  .disclosure strong { flex: none; color: var(--ink); font-weight: 550; }
  .chevron { color: var(--ink-soft); }
  .status { flex: none; color: var(--ink-faint); font-size: 10px; }
  .patch { max-height: 470px; overflow: auto; margin: 0; padding: 8px 0 10px; color: var(--ink-soft); background: color-mix(in srgb, var(--sidebar) 55%, var(--surface)); font-family: var(--mono); font-size: 11px; line-height: 1.65; tab-size: 2; }
  .patch span { display: block; min-height: 1.65em; padding: 0 12px; white-space: pre; }
  .patch .added { color: var(--ok); background: var(--ok-soft); }
  .patch .removed { color: var(--bad); background: var(--bad-soft); }
  .patch .hunk { color: var(--ink); background: var(--mark); }
  .patch .meta { color: var(--ink-faint); }
  .binary, .truncated, .all-reviewed { padding: 12px; color: var(--ink-faint); font-size: 12px; }
  .truncated { margin: 0; padding: 8px 12px; color: var(--bad); background: var(--bad-soft); }
  .all-reviewed { margin: 0; }
  .closing { max-width: 1330px; margin: 22px auto; color: var(--ink-soft); font-size: 12px; }
  .banner { margin: 8px 18px 0; padding: 8px 12px; border-radius: 8px; background: var(--sidebar); color: var(--ink-soft); font-size: 12px; }
  .banner.bad { color: var(--bad); background: var(--bad-soft); }
  @media (max-width: 900px) {
    .content { padding: 24px 18px 50px; }
    .guide-section { grid-template-columns: 1fr; gap: 18px; }
    .section-files { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  }
  @media (max-width: 620px) {
    .bar { gap: 9px; padding: 0 10px; }
    .repo, .summary { display: none; }
    .bar-right { gap: 8px; }
    .target { align-items: stretch; flex-wrap: wrap; }
    .target label { flex: 1; min-width: 130px; }
    select { min-width: 0; width: 100%; }
    .arrow { display: none; }
    .target .btn { align-self: end; }
    .guide-actions { align-items: start; flex-direction: column; }
    .file-row { flex-wrap: wrap; }
  }
</style>
