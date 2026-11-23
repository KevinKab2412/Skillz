<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { agent, api, noteKey, type AgentEvent, type Note, type PiStatus, type ReviewBaseSource, type ReviewChatContext, type ReviewDiff, type ReviewFile, type ReviewSection, type ReviewState, type Settings } from "$lib/api";
  import { buildGuidePrompt, buildReviewChatPrompt, parseGuide, parsePatchRows, reviewContextForSelection, type PatchRow } from "$lib/review-guide";

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
  let chatBusy = $state(false);
  let chatOpen = $state(false);
  let guideOutput = $state("");
  let chatOutput = $state("");
  let guideError = $state<string | null>(null);
  let chatError = $state<string | null>(null);
  let chatDraft = $state("");
  let selectionOffer = $state<{ context: ReviewChatContext; left: number; top: number } | null>(null);
  let chatScroller: HTMLDivElement | undefined = $state();
  let error = $state<string | null>(null);
  let baseUpdated = $state(false);
  let baseChangedByUser = $state(false);
  let hideReviewed = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let unlisten: (() => void) | null = null;
  let disposed = false;
  let activeRequest: "guide" | "chat" | null = null;
  let activeChatContext: ReviewChatContext | null = null;

  const key = $derived(noteKey(folder, note.name));
  const emptyReview = (): ReviewState => ({ repo_path: null, base_source: null, base_refresh_required: null, base_branch: null, head_branch: null, base_commit: null, head_commit: null, reviewed_files: [], guide: null, chat_context: null, chat: [] });
  const reviewState = (): ReviewState => note.sidecar.review ?? emptyReview();
  const reviewRepoPath = () => reviewState().repo_path?.trim() || folder;
  function mutableReviewState(): ReviewState {
    if (!note.sidecar.review) note.sidecar.review = emptyReview();
    const state = note.sidecar.review;
    state.chat ??= [];
    state.chat_context ??= null;
    return state;
  }
  const reviewed = (path: string) => reviewState().reviewed_files.includes(path);
  const isDefaultBase = (branch: string) => /(^|\/)(main|master)$/.test(branch);
  const branchForPrBase = (prBase: { branch: string; remote: string | null } | null, available: string[]) => {
    if (!prBase) return "";
    if (prBase.remote) {
      const remoteBranch = `${prBase.remote}/${prBase.branch}`;
      return available.includes(remoteBranch) ? remoteBranch : "";
    }
    if (available.includes(prBase.branch)) return prBase.branch;
    const remotes = available.filter((branch) => branch.endsWith(`/${prBase.branch}`));
    return remotes.length === 1 ? remotes[0] : "";
  };
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
    mutableReviewState();
    await api.saveSidecar(folder, note.name, $state.snapshot(note.sidecar) as Note["sidecar"]).catch((e) => (error = String(e)));
  }

  async function loadBranches() {
    loadingBranches = true;
    error = null;
    baseUpdated = false;
    try {
      const saved = reviewState();
      const result = await api.reviewBranches(reviewRepoPath(), !saved.base_source);
      branches = result.branches;
      const savedBase = saved.base_branch && branches.includes(saved.base_branch) ? saved.base_branch : "";
      const prBase = branchForPrBase(result.pr_base, branches);
      const fallbackBase = branches.find((branch) => /(^|\/)main$|(^|\/)master$/.test(branch)) ?? branches[0] ?? "";
      let nextBaseSource: ReviewBaseSource | null = saved.base_source ?? null;
      let deferDiff = saved.base_refresh_required === true || (saved.base_source === "pull_request" && saved.base_refresh_required == null);
      if (deferDiff) baseUpdated = true;

      if (saved.base_source) {
        base = savedBase;
        if (!savedBase) error = `Saved base branch “${saved.base_branch}” is not available in this worktree. Choose another base branch.`;
      } else if (result.pr_base_status === "found" && result.pr_base) {
        if (!savedBase || isDefaultBase(savedBase)) {
          base = prBase;
          if (prBase) {
            nextBaseSource = "pull_request";
            deferDiff = !!savedBase && savedBase !== prBase;
            baseUpdated = deferDiff;
          } else {
            error = `PR base “${result.pr_base.branch}” is not available unambiguously in this worktree. Fetch it or choose a base branch manually.`;
          }
        } else {
          base = savedBase;
          nextBaseSource = "manual";
        }
      } else if (result.pr_base_status === "not_found") {
        base = savedBase || fallbackBase;
        nextBaseSource = savedBase && !isDefaultBase(savedBase) ? "manual" : "fallback";
      } else {
        base = savedBase || fallbackBase;
      }
      head = saved.head_branch && branches.includes(saved.head_branch) && saved.head_branch !== base
        ? saved.head_branch
        : result.current && result.current !== base
          ? result.current
          : branches.find((branch) => branch !== base) ?? "";
      if (base && (saved.base_branch !== base || saved.head_branch !== (head || null) || saved.base_source !== nextBaseSource)) {
        const state = mutableReviewState();
        state.base_branch = base;
        state.head_branch = head || null;
        state.base_source = nextBaseSource;
        if (deferDiff) state.base_refresh_required = true;
        else if (result.pr_base_status === "not_found" || nextBaseSource) state.base_refresh_required = false;
        await saveReview();
      } else if (base && deferDiff && saved.base_refresh_required !== true) {
        mutableReviewState().base_refresh_required = true;
        await saveReview();
      }
      if (!base) {
        diff = null;
        expanded = {};
      } else if (deferDiff) {
        diff = null;
        expanded = {};
      } else if (base && head) {
        await loadDiff();
      }
    } catch (e) {
      const message = String(e);
      error = message.includes("not a git repository")
        ? "Choose a Git repository for this review. The note can stay in a workspace folder."
        : message;
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
      const next = await api.reviewDiff(reviewRepoPath(), base, head);
      const state = mutableReviewState();
      if (baseChangedByUser) state.base_source = "manual";
      baseChangedByUser = false;
      baseUpdated = false;
      state.base_refresh_required = false;
      const sameRevision = state.base_commit === next.base_commit && state.head_commit === next.head_commit;
      if (!sameRevision) {
        state.reviewed_files = [];
        state.guide = null;
        state.chat = [];
        state.chat_context = null;
        guideOutput = "";
        chatOutput = "";
        chatError = null;
        selectionOffer = null;
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
    if (diff?.files.length && !reviewState().guide) void draftGuide();
  }

  async function chooseRepository() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose the repository to review",
    });
    if (typeof selected !== "string") return;

    const state = mutableReviewState();
    if (state.repo_path !== selected) {
      await agent.close(folder, note.name).catch(() => {});
      state.repo_path = selected;
      state.base_source = null;
      state.base_refresh_required = null;
      state.base_branch = null;
      state.head_branch = null;
      state.base_commit = null;
      state.head_commit = null;
      state.reviewed_files = [];
      state.guide = null;
      state.chat_context = null;
      state.chat = [];
      note.sidecar.session.id = null;
      note.sidecar.session.interrupted = null;
      diff = null;
      branches = [];
      base = "";
      head = "";
      baseChangedByUser = false;
      baseUpdated = false;
      expanded = {};
      guideOutput = "";
      guideError = null;
      chatOutput = "";
      chatError = null;
      chatDraft = "";
      chatOpen = false;
      activeChatContext = null;
      selectionOffer = null;
    }
    await saveReview();
    await loadBranches();
  }

  async function toggleReviewed(path: string) {
    const state = mutableReviewState();
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

  function rowForNode(node: Node | null): HTMLElement | null {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>("[data-row-index]") ?? null;
  }

  function selectDiffText(selection: Selection | null, pre: HTMLElement, file: ReviewFile, rows: PatchRow[]) {
    if (guideBusy || chatBusy) {
      selectionOffer = null;
      return;
    }
    const text = selection?.toString().trim();
    if (!selection || !text || !pre.contains(selection.anchorNode) || !pre.contains(selection.focusNode)) {
      selectionOffer = null;
      return;
    }
    const start = rowForNode(selection.anchorNode);
    const end = rowForNode(selection.focusNode);
    if (!start || !end) {
      selectionOffer = null;
      return;
    }
    const startIndex = Number(start.dataset.rowIndex);
    const endIndex = Number(end.dataset.rowIndex);
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
      selectionOffer = null;
      return;
    }
    const context = reviewContextForSelection(file.path, rows, startIndex, endIndex, text);
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    selectionOffer = {
      context,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 190)),
      top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 48)),
    };
  }

  function captureDiffSelection() {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const pre = anchor?.closest<HTMLElement>("pre.patch");
    if (!pre) {
      selectionOffer = null;
      return;
    }
    const file = diff?.files.find((item) => item.path === pre.dataset.reviewFile);
    if (file) selectDiffText(selection, pre, file, parsePatchRows(file.patch));
  }

  async function openChat(context: ReviewChatContext) {
    selectionOffer = null;
    window.getSelection()?.removeAllRanges();
    mutableReviewState().chat_context = context;
    chatOpen = true;
    chatError = null;
    await saveReview();
    scrollChatToEnd();
  }

  function openChatFromSelection() {
    if (selectionOffer) void openChat(selectionOffer.context);
  }

  function scrollChatToEnd() {
    requestAnimationFrame(() => {
      if (chatScroller) chatScroller.scrollTop = chatScroller.scrollHeight;
    });
  }

  async function sendChat(event?: SubmitEvent) {
    event?.preventDefault();
    const question = chatDraft.trim();
    const context = reviewState().chat_context;
    if (!question || !context || guideBusy || chatBusy) return;
    if (!pi?.path) {
      chatError = "Pair cannot find Pi. Set its path in Settings before starting a review chat.";
      return;
    }

    const state = mutableReviewState();
    state.chat = [...state.chat, { id: crypto.randomUUID(), role: "user", text: question }];
    activeChatContext = $state.snapshot(context) as ReviewChatContext;
    chatDraft = "";
    chatOutput = "";
    chatError = null;
    chatBusy = true;
    activeRequest = "chat";
    const sessionId = note.sidecar.session.id ?? crypto.randomUUID();
    note.sidecar.session.id = sessionId;
    await saveReview();
    scrollChatToEnd();
    try {
      await agent.ask(folder, note.name, sessionId, note.sidecar.model ?? settings.default_model, buildReviewChatPrompt(activeChatContext, question), reviewRepoPath());
    } catch (e) {
      activeRequest = null;
      chatBusy = false;
      chatError = String(e);
    }
  }

  async function draftGuide() {
    if (!diff || guideBusy || chatBusy) return;
    if (!pi?.path) {
      guideError = "Pair cannot find Pi. Set its path in Settings before asking for a guide.";
      return;
    }
    guideBusy = true;
    activeRequest = "guide";
    guideOutput = "";
    guideError = null;
    const sessionId = note.sidecar.session.id ?? crypto.randomUUID();
    note.sidecar.session.id = sessionId;
    await saveReview();
    try {
      await agent.ask(folder, note.name, sessionId, note.sidecar.model ?? settings.default_model, buildGuidePrompt(diff), reviewRepoPath());
    } catch (e) {
      activeRequest = null;
      guideBusy = false;
      guideError = String(e);
    }
  }

  function handleChatKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendChat();
    }
  }

  async function onAgentEvent(event: AgentEvent) {
    if (event.key !== key) return;
    const record = event.record;
    if (record.type === "pair_started" && activeRequest === "guide") {
      guideOutput = "";
    } else if (record.type === "pair_started" && activeRequest === "chat") {
      chatOutput = "";
    } else if (record.type === "message_update" && activeRequest) {
      const message = record.assistantMessageEvent;
      if (message?.type === "text_delta") {
        if (activeRequest === "guide") guideOutput += String(message.delta ?? "");
        else {
          chatOutput += String(message.delta ?? "");
          scrollChatToEnd();
        }
      }
    } else if (record.type === "pair_error" && activeRequest) {
      const failedRequest = activeRequest;
      activeRequest = null;
      if (failedRequest === "guide") {
        guideBusy = false;
        guideError = String(record.error ?? "Pair could not draft a guide.");
      } else {
        chatBusy = false;
        chatError = String(record.error ?? "Pair could not answer this review question.");
      }
    } else if (record.type === "pair_exited" && activeRequest) {
      const failedRequest = activeRequest;
      activeRequest = null;
      if (failedRequest === "guide") {
        guideBusy = false;
        guideError = "Pair stopped before finishing the guide. Reload the diff and try again.";
      } else {
        chatBusy = false;
        chatError = "Pair stopped before answering. Your question is saved in this review.";
      }
    } else if (record.type === "pair_settled" && activeRequest) {
      const finishedRequest = activeRequest;
      activeRequest = null;
      if (finishedRequest === "guide") {
        guideBusy = false;
        try {
          mutableReviewState().guide = parseGuide(guideOutput, diff?.files.map((file) => file.path) ?? []);
          await saveReview();
        } catch (e) {
          guideError = `Pair's reply could not be read as a guide: ${String(e)}`;
        }
      } else {
        chatBusy = false;
        const reply = chatOutput.trim();
        if (reply) {
          const state = mutableReviewState();
          state.chat = [...state.chat, { id: crypto.randomUUID(), role: "assistant", text: reply }];
          await saveReview();
        } else {
          chatError = "Pair finished without a text reply. Try asking in a different way.";
        }
        activeChatContext = null;
        scrollChatToEnd();
      }
    }
  }

  onMount(() => {
    mutableReviewState();
    loadBranches();
    document.addEventListener("mouseup", captureDiffSelection);
    listen<AgentEvent>("agent-event", ({ payload }) => void onAgentEvent(payload)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
  });

  onDestroy(() => {
    disposed = true;
    document.removeEventListener("mouseup", captureDiffSelection);
    unlisten?.();
    if (activeRequest) void agent.close(folder, note.name).catch(() => {});
  });
</script>

<div class="review-view">
  <header class="bar" data-tauri-drag-region>
    <span class="brand"><span class="mark">↗</span> Code review</span>
    <span class="repo" title={reviewRepoPath()}>{reviewRepoPath().split("/").filter(Boolean).at(-1) ?? reviewRepoPath()}</span>
    {#if diff}<span class="summary">{diff.total_files} files · <b>+{diff.files.reduce((n, file) => n + file.additions, 0)}</b> <i>−{diff.files.reduce((n, file) => n + file.deletions, 0)}</i></span>{/if}
    <div class="bar-right">
      {#if diff}<span class="progress">{reviewedCount()} / {diff.files.length} reviewed{#if diff.files.length < diff.total_files} · {diff.total_files} total{/if}</span>{/if}
      {#if reviewState().chat_context}
        <button class="quiet chat-toggle" onclick={() => (chatOpen = true)}>Ask about selection</button>
      {/if}
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
        <p class="lede">Pair organizes the diff into a behavior-first review sequence. When available, it starts from and saves this worktree’s PR base. You can change the base or branch here; you read each diff and decide what holds.</p>
        <div class="repo-picker">
          <div><span>Repository</span><code title={reviewRepoPath()}>{reviewRepoPath()}</code></div>
          <button class="btn" onclick={chooseRepository} disabled={loadingBranches || loadingDiff || guideBusy || chatBusy}>Choose repository…</button>
        </div>
        <div class="target">
          <label>Base <select aria-label="Base branch" bind:value={base} onchange={() => (baseChangedByUser = true)} disabled={loadingBranches || guideBusy || chatBusy}>
            <option value="">Choose a base…</option>
            {#each branches as branch}<option value={branch}>{branch}</option>{/each}
          </select></label>
          <span class="arrow">←</span>
          <label>Review <select aria-label="Branch to review" bind:value={head} disabled={loadingBranches || guideBusy || chatBusy}>
            <option value="">Choose a branch…</option>
            {#each branches as branch}<option value={branch}>{branch}</option>{/each}
          </select></label>
          <button class="btn primary" onclick={loadDiff} disabled={loadingBranches || loadingDiff || guideBusy || chatBusy || !base || !head}>{loadingDiff ? "Loading…" : diff ? "Refresh diff" : "Load diff"}</button>
        </div>
        {#if diff}
          <div class="commit-line"><code>{shortCommit(diff.base_commit)}</code> → <code>{shortCommit(diff.head_commit)}</code> · merge base <code>{shortCommit(diff.merge_base)}</code></div>
        {/if}
        {#if diff?.truncated}<p class="limit">This review is large. Pair’s guide may use partial diff context; inspect every file in the list yourself.</p>{/if}
      </section>

      {#if loadingBranches}
        <div class="empty">Reading local Git branches…</div>
      {:else if loadingDiff && !diff}
        <div class="empty">Loading the default branch comparison…</div>
      {:else if !diff}
        <div class="empty">{baseUpdated ? `The PR base was updated to ${base}. Load the comparison to continue.` : "Load a branch comparison to start your review."}</div>
      {:else if !diff.files.length}
        <div class="empty">These branches have no committed changes to review.</div>
      {:else}
        <div class="guide-actions">
          <div><strong>Review guide</strong><p>Pair groups related changes into behavior sections and attaches suggestions to the files they discuss.</p></div>
          <button class="btn" onclick={draftGuide} disabled={guideBusy || chatBusy || !diff}>{guideBusy ? "Pair is organizing sections…" : guideError ? "Retry guide" : reviewState().guide ? "Refresh guide" : "Generate guide"}</button>
        </div>
        {#if !reviewState().guide?.sections?.length && !guideBusy}
          <p class="fallback-note">{guideError ? "Pair could not prepare the section guide. The changed files are still available below; retry when ready." : "Pair is preparing the behavior-first section guide."}</p>
        {/if}
        {#if guideError}<div class="pair-error" role="status">{guideError}{#if guideOutput}<pre>{guideOutput}</pre>{/if}</div>{/if}
        {#if guideBusy}<div class="pair-working"><span class="dot"></span>Pair is grouping the supplied diff into a review sequence. You can keep reviewing while it works.</div>{/if}

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
                      {@const rows = parsePatchRows(file.patch)}
                      <pre class="patch" data-review-file={file.path} role="region" aria-label={`Diff for ${file.path}`}>{#each rows as row, rowIndex (`${rowIndex}-${row.text.slice(0, 16)}`)}<span data-row-index={rowIndex} class:added={row.kind === "added"} class:removed={row.kind === "removed"} class:hunk={row.kind === "hunk"} class:meta={row.kind === "meta"}>{row.text || " "}</span>{/each}</pre>
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

  {#if selectionOffer}
    <button class="selection-ask" style:left={`${selectionOffer.left}px`} style:top={`${selectionOffer.top}px`} onmousedown={(event) => event.preventDefault()} onclick={openChatFromSelection}>
      Ask Pair about these lines
    </button>
  {/if}

  {#if chatOpen}
    {@const chatContext = reviewState().chat_context}
    <aside class="chat-panel" aria-label="Review chat">
      <div class="chat-heading">
        <div><span class="chat-kicker">CODE REVIEW</span><h2>Ask Pair</h2></div>
        <button class="chat-close" aria-label="Close review chat" onclick={() => (chatOpen = false)}>×</button>
      </div>
      {#if chatContext}
        <div class="chat-context">
          <strong>{chatContext.path}</strong>
          <span>{chatContext.location}</span>
          <pre>{chatContext.selection || chatContext.excerpt}</pre>
        </div>
      {/if}
      <div class="chat-messages" bind:this={chatScroller} aria-live="polite">
        {#if !reviewState().chat.length && !chatOutput}
          <p class="chat-empty">Ask what the selected lines do, why they changed, or what behavior you should verify.</p>
        {/if}
        {#each reviewState().chat as message (message.id)}
          <div class:from-user={message.role === "user"} class="chat-message">
            <span>{message.role === "user" ? "You" : "Pair"}</span><p>{message.text}</p>
          </div>
        {/each}
        {#if chatOutput}
          <div class="chat-message"><span>Pair</span><p>{chatOutput}</p></div>
        {/if}
        {#if chatBusy && !chatOutput}
          <div class="chat-wait"><span class="dot"></span>Pair is reading the selected diff…</div>
        {/if}
        {#if chatError}<p class="chat-error" role="status">{chatError}</p>{/if}
      </div>
      <form class="chat-compose" onsubmit={sendChat}>
        <textarea bind:value={chatDraft} onkeydown={handleChatKeydown} aria-label="Ask Pair about the selected diff" placeholder="Ask about these lines…" rows="3" disabled={chatBusy}></textarea>
        <div><span>Enter to send · Shift + Enter for a new line</span><button class="btn primary" type="submit" disabled={!chatDraft.trim() || chatBusy}>{chatBusy ? "Thinking…" : "Send"}</button></div>
      </form>
    </aside>
  {/if}
</div>

<style>
  .review-view { position: relative; flex: 1; display: flex; min-width: 0; min-height: 0; flex-direction: column; background: var(--bg); }
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
  .chat-toggle { color: var(--accent); }
  .scroller { flex: 1; overflow: auto; }
  .content { width: min(1420px, 100%); margin: 0 auto; padding: 36px 38px 70px; box-sizing: border-box; }
  .intro { max-width: 940px; margin: 0 auto 34px; }
  .eyebrow, .section-number { color: var(--ink-faint); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
  h1 { margin: 6px 0 8px; font-family: var(--serif); font-size: clamp(25px, 3vw, 34px); font-weight: 500; letter-spacing: -.025em; }
  .lede { max-width: 710px; margin: 0; color: var(--ink-soft); line-height: 1.55; font-size: 14px; }
  .repo-picker { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 20px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); }
  .repo-picker > div { display: grid; min-width: 0; gap: 4px; }
  .repo-picker > div > span { color: var(--ink-faint); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .repo-picker code { overflow: hidden; color: var(--ink-soft); font-family: var(--mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .repo-picker .btn { flex: none; }
  .target { display: flex; align-items: end; gap: 10px; margin-top: 16px; }
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
  .fallback-note { max-width: 1330px; margin: -10px auto 18px; color: var(--ink-faint); font-size: 11px; }
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
  .patch { max-height: 470px; overflow: auto; margin: 0; padding: 8px 0 10px; color: var(--ink-soft); background: color-mix(in srgb, var(--sidebar) 55%, var(--surface)); font-family: var(--mono); font-size: 11px; line-height: 1.65; tab-size: 2; user-select: text; }
  .patch span { display: block; min-height: 1.65em; padding: 0 12px; white-space: pre; }
  .patch .added { color: var(--ok); background: var(--ok-soft); }
  .patch .removed { color: var(--bad); background: var(--bad-soft); }
  .patch .hunk { color: var(--ink); background: var(--mark); }
  .patch .meta { color: var(--ink-faint); }
  .binary, .truncated, .all-reviewed { padding: 12px; color: var(--ink-faint); font-size: 12px; }
  .truncated { margin: 0; padding: 8px 12px; color: var(--bad); background: var(--bad-soft); }
  .all-reviewed { margin: 0; }
  .closing { max-width: 1330px; margin: 22px auto; color: var(--ink-soft); font-size: 12px; }
  .selection-ask { position: fixed; z-index: 20; padding: 7px 10px; border: 1px solid var(--rule); border-radius: 7px; color: var(--bg); background: var(--ink); box-shadow: 0 5px 18px #0004; font-size: 11px; white-space: nowrap; }
  .selection-ask:hover { background: var(--accent); }
  .chat-panel { position: absolute; z-index: 15; top: 54px; right: 16px; bottom: 16px; display: flex; width: min(430px, calc(100% - 32px)); min-height: 260px; flex-direction: column; overflow: hidden; border: 1px solid var(--rule); border-radius: 12px; background: var(--surface); box-shadow: 0 16px 50px #0005; }
  .chat-heading { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 12px; border-bottom: 1px solid var(--rule); background: var(--sidebar); }
  .chat-kicker { color: var(--accent); font-size: 9px; letter-spacing: .1em; }
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
  .btn.primary { border-color: var(--accent); color: var(--bg); background: var(--accent); }
  .btn.primary:hover:not(:disabled) { filter: brightness(1.08); color: var(--bg); }
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
    .progress { display: none; }
    .chat-panel { top: 48px; right: 8px; bottom: 8px; width: calc(100% - 16px); }
    .repo-picker { align-items: stretch; flex-direction: column; }
    .target { align-items: stretch; flex-wrap: wrap; }
    .target label { flex: 1; min-width: 130px; }
    select { min-width: 0; width: 100%; }
    .arrow { display: none; }
    .target .btn { align-self: end; }
    .guide-actions { align-items: start; flex-direction: column; }
    .file-row { flex-wrap: wrap; }
  }
</style>
