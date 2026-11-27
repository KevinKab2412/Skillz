<script lang="ts">
  import SelectionChat from "./SelectionChat.svelte";
  import { onDestroy, onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { agent, api, noteKey, type AgentEvent, type Note, type PiStatus, type ReviewBaseSource, type ReviewChatContext, type ReviewDiff, type ReviewFile, type ReviewSection, type ReviewState, type ReviewVerification, type Settings } from "$lib/api";
  import { buildGuidePrompt, buildReviewChatPrompt, noteSelectionContext, parseGuide, parsePatchRows, reviewContextForSelection, type PatchRow } from "$lib/review-guide";

  let {
    folder,
    note = $bindable(),
    settings,
    pi,
    interrupted = null,
    onSaved,
  }: {
    folder: string;
    note: Note;
    settings: Settings;
    pi: PiStatus | null;
    interrupted?: string | null;
    onSaved: (folder: string, note: Note) => void;
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
  let contentRoot = $state<HTMLDivElement>();
  let error = $state<string | null>(null);
  let baseUpdated = $state(false);
  let baseChangedByUser = $state(false);
  let hideReviewed = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let collapsedSuggestions = $state<Record<string, boolean>>({});
  let expandedNits = $state<Record<string, boolean>>({});
  let expandedPreviousPrompts = $state<Record<string, boolean>>({});
  let unlisten: (() => void) | null = null;
  let disposed = false;
  let deleting = false;
  let reviewSaving: Promise<void> = Promise.resolve();
  let activeRequest: "guide" | "chat" | null = null;
  let testApproval = $state<{ id: string; command: string; cwd: string; reason: string } | null>(null);
  let verification: ReviewVerification[] = [];

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
    if (deleting) return;
    mutableReviewState();
    const sidecar = $state.snapshot(note.sidecar) as Note["sidecar"];
    reviewSaving = reviewSaving.then(async () => {
      if (deleting) return;
      try {
        await api.saveSidecar(folder, note.name, sidecar);
        if (!deleting) onSaved(folder, { name: note.name, markdown: note.markdown, sidecar });
      } catch (e) {
        error = String(e);
      }
    });
    await reviewSaving;
  }

  /** Stop review writes and agent requests before the note is removed from disk. */
  export async function prepareForDeletion() {
    deleting = true;
    if (activeRequest) await agent.close(folder, note.name).catch(() => {});
    await reviewSaving;
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
      const sameBranches = state.base_branch === next.base_branch && state.head_branch === next.head_branch;
      if (!sameRevision || !sameBranches) state.guide = null;
      if (!sameRevision) {
        state.reviewed_files = [];
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

  function toggleSuggestions(sectionId: string) {
    collapsedSuggestions[sectionId] = !collapsedSuggestions[sectionId];
  }

  function toggleNits(sectionId: string) {
    expandedNits[sectionId] = !expandedNits[sectionId];
  }

  function togglePreviousPrompts(sectionId: string) {
    expandedPreviousPrompts[sectionId] = !expandedPreviousPrompts[sectionId];
  }

  function goToSuggestion(path: string, line?: number | null, side?: "old" | "new" | null) {
    hideReviewed = false;
    const file = diff?.files.find((item) => item.path === path);
    const rows = file ? parsePatchRows(file.patch) : [];
    const rowIndex = line && side ? rows.findIndex((row) => (side === "old" ? row.oldLine : row.newLine) === line) : -1;
    expanded[path] = true;
    requestAnimationFrame(() => {
      const fileElement = document.getElementById(`review-file-${encodeURIComponent(path)}`);
      const lineElement = rowIndex >= 0 ? fileElement?.querySelector<HTMLElement>(`[data-row-index="${rowIndex}"]`) : null;
      (lineElement ?? fileElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
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
    offerChat(selection, reviewContextForSelection(file.path, rows, startIndex, endIndex, text));
  }

  function offerChat(selection: Selection, context: ReviewChatContext) {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    selectionOffer = {
      context,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 190)),
      top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 48)),
    };
  }

  function captureSelection() {
    selectionOffer = null;
    if (guideBusy || chatBusy) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    if (!anchor || !contentRoot?.contains(anchor)) return;
    const pre = anchor?.closest<HTMLElement>("pre.patch");
    if (pre) {
      const file = diff?.files.find((item) => item.path === pre.dataset.reviewFile);
      if (file) selectDiffText(selection, pre, file, parsePatchRows(file.patch));
      return;
    }
    const block = anchor.closest<HTMLElement>("[data-review-text]");
    const text = selection.toString().trim();
    if (!text || !block?.contains(selection.focusNode)) return;
    offerChat(selection, noteSelectionContext(block.dataset.reviewText ?? "Review note", "Highlighted review text", text, block.innerText));
  }

  async function openChat(context: ReviewChatContext) {
    selectionOffer = null;
    window.getSelection()?.removeAllRanges();
    mutableReviewState().chat_context = context;
    chatOpen = true;
    chatError = null;
    await saveReview();
  }

  function openChatFromSelection() {
    if (selectionOffer) void openChat(selectionOffer.context);
  }

  async function sendChat() {
    if (deleting) return;
    const question = chatDraft.trim();
    const context = reviewState().chat_context;
    if (!question || !context || guideBusy || chatBusy) return;
    if (!pi?.path) {
      chatError = "Pair cannot find Pi. Set its path in Settings before starting a review chat.";
      return;
    }

    const state = mutableReviewState();
    state.chat = [...state.chat, { id: crypto.randomUUID(), role: "user", text: question }];
    const message = buildReviewChatPrompt(context, question);
    chatDraft = "";
    chatOutput = "";
    chatError = null;
    chatBusy = true;
    activeRequest = "chat";
    const sessionId = note.sidecar.session.id ?? crypto.randomUUID();
    note.sidecar.session.id = sessionId;
    await saveReview();
    if (deleting) return;
    try {
      await agent.ask(folder, note.name, sessionId, note.sidecar.model ?? settings.default_model, message, reviewRepoPath());
    } catch (e) {
      activeRequest = null;
      chatBusy = false;
      chatError = String(e);
    }
  }

  async function draftGuide() {
    if (deleting || !diff || loadingDiff || guideBusy || chatBusy) return;
    if (!pi?.path) {
      guideError = "Pair cannot find Pi. Set its path in Settings before asking for a guide.";
      return;
    }
    const comparison = diff;
    const repo = reviewRepoPath();
    guideBusy = true;
    guideOutput = "";
    guideError = null;
    testApproval = null;
    verification = [];
    const sessionId = note.sidecar.session.id ?? crypto.randomUUID();
    note.sidecar.session.id = sessionId;
    await saveReview();
    if (deleting || disposed) return;
    try {
      const pullRequest = await api.reviewPullRequest(repo, comparison.base_branch, comparison.head_branch, comparison.head_commit).catch(() => null);
      if (deleting || disposed) return;
      activeRequest = "guide";
      await agent.ask(folder, note.name, sessionId, note.sidecar.model ?? settings.default_model, buildGuidePrompt(comparison, pullRequest), repo);
    } catch (e) {
      activeRequest = null;
      guideBusy = false;
      guideError = String(e);
    }
  }

  async function answerReviewTool(id: string, decision: "accept" | "decline") {
    try {
      await agent.send(folder, note.name, { type: "extension_ui_response", id, value: JSON.stringify({ decision }) });
    } catch (e) {
      guideError = String(e);
      testApproval = null;
      activeRequest = null;
      guideBusy = false;
      await agent.close(folder, note.name).catch(() => {});
    }
  }

  function decideTest(decision: "accept" | "decline") {
    if (!testApproval || activeRequest !== "guide") return;
    const id = testApproval.id;
    testApproval = null;
    void answerReviewTool(id, decision);
  }

  async function onReviewTool(id: string, title: string, value: string) {
    try {
      const data = JSON.parse(value);
      if (typeof data.program !== "string" || !Array.isArray(data.args) || !data.args.every((arg: unknown) => typeof arg === "string")) {
        await answerReviewTool(id, "decline");
        return;
      }
      const command = [data.program, ...data.args].map((arg) => /^[\w./:=+@-]+$/.test(arg) ? arg : JSON.stringify(arg)).join(" ");
      if (title === "pair:review_test" && !testApproval) {
        testApproval = { id, command, cwd: String(data.cwd), reason: String(data.reason) };
      } else if (title === "pair:review_test_result" && ["passed", "failed", "skipped", "inconclusive"].includes(data.status) && typeof data.message === "string") {
        verification.push({ command, status: data.status, message: data.message.slice(0, 9_000) });
        await answerReviewTool(id, "accept");
      } else {
        await answerReviewTool(id, "decline");
      }
    } catch {
      await answerReviewTool(id, "decline");
    }
  }

  async function onAgentEvent(event: AgentEvent) {
    if (deleting || event.key !== key) return;
    const record = event.record;
    if (record.type === "extension_ui_request" && activeRequest === "guide" && record.method === "editor") {
      await onReviewTool(record.id, record.title, record.prefill);
    } else if (record.type === "pair_started" && activeRequest === "guide") {
      guideOutput = "";
    } else if (record.type === "pair_started" && activeRequest === "chat") {
      chatOutput = "";
    } else if (record.type === "message_start" && activeRequest === "guide" && record.message?.role === "assistant") {
      // Each tool round can start a new assistant message. The final message carries the guide JSON.
      guideOutput = "";
    } else if (record.type === "message_update" && activeRequest) {
      const message = record.assistantMessageEvent;
      if (message?.type === "text_delta") {
        if (activeRequest === "guide") guideOutput += String(message.delta ?? "");
        else chatOutput += String(message.delta ?? "");
      }
    } else if (record.type === "pair_error" && activeRequest) {
      const failedRequest = activeRequest;
      activeRequest = null;
      if (failedRequest === "guide") {
        guideBusy = false;
        testApproval = null;
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
        testApproval = null;
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
        testApproval = null;
        try {
          const guide = parseGuide(guideOutput, diff?.files ?? []);
          mutableReviewState().guide = { ...guide, verification: [...verification] };
          await saveReview();
        } catch (e) {
          guideError = `Pair's reply could not be read as a guide: ${String(e)}`;
        }
      } else {
        chatBusy = false;
        const reply = chatOutput.trim();
        chatOutput = "";
        if (reply) {
          const state = mutableReviewState();
          state.chat = [...state.chat, { id: crypto.randomUUID(), role: "assistant", text: reply }];
          await saveReview();
        } else {
          chatError = "Pair finished without a text reply. Try asking in a different way.";
        }
      }
    }
  }

  onMount(() => {
    mutableReviewState();
    loadBranches();
    document.addEventListener("mouseup", captureSelection);
    document.addEventListener("keyup", captureSelection);
    listen<AgentEvent>("agent-event", ({ payload }) => void onAgentEvent(payload)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
  });

  onDestroy(() => {
    disposed = true;
    document.removeEventListener("mouseup", captureSelection);
    document.removeEventListener("keyup", captureSelection);
    unlisten?.();
    if (activeRequest && !deleting) void agent.close(folder, note.name).catch(() => {});
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
      <button class="quiet" aria-pressed={hideReviewed} onclick={() => (hideReviewed = !hideReviewed)}>{hideReviewed ? "Show reviewed" : "Hide reviewed"}</button>
    </div>
  </header>

  {#if interrupted}
    <p class="banner">Pair was interrupted while working on this review. <span>{interrupted}</span></p>
  {/if}
  {#if error}<p class="banner bad" role="alert">{error} <button onclick={() => (error = null)}>×</button></p>{/if}

  <div class="scroller">
    <div class="content" bind:this={contentRoot}>
      <section class="intro">
        <p class="eyebrow">A review you lead</p>
        <h1>Follow the change, one story at a time.</h1>
        <p class="lede" data-review-text="Review introduction">Pair organizes the diff into a behavior-first review sequence. When available, it starts from and saves this worktree’s PR base. You can change the base or branch here; you read each diff and decide what holds.</p>
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
        {@const guide = reviewState().guide}
        <div class="guide-actions">
          <div><strong>Review guide</strong><p>Pair groups related changes into behavior sections and attaches suggestions to the files they discuss.</p></div>
          <button class="btn" onclick={draftGuide} disabled={guideBusy || chatBusy || loadingDiff}>{guideBusy ? "Pair is preparing the guide…" : guideError ? "Retry guide" : guide ? "Refresh guide" : "Generate guide"}</button>
        </div>
        {#if !guide?.sections?.length && !guideBusy}
          <p class="fallback-note">{guideError ? "Pair could not prepare the section guide. The changed files are still available below; retry when ready." : "Pair is preparing the behavior-first section guide."}</p>
        {/if}
        {#if guideError}<div class="pair-error" role="status">{guideError}{#if guideOutput}<pre>{guideOutput}</pre>{/if}</div>{/if}
        {#if guideBusy && !testApproval}<div class="pair-working"><span class="dot"></span>Pair is checking repo rules, tracing the change, and preparing the walkthrough.</div>{/if}
        {#if testApproval}
          <section class="review-test" aria-label="Review test approval">
            <strong>Run a review test?</strong>
            <p>{testApproval.reason}</p>
            <code>{testApproval.cwd}</code>
            <pre>{testApproval.command}</pre>
            <div><button class="btn" onclick={() => decideTest("decline")}>Skip test</button><button class="btn primary" onclick={() => decideTest("accept")}>Run test</button></div>
          </section>
        {/if}

        {#if guide?.goal || guide?.attempt}
          <section class="guide-opening" aria-label="Review overview" data-review-text="Review overview">
            <h2>The goal</h2>
            <p>{guide.goal ?? "The available context doesn’t establish a goal."}</p>
            <h2>The attempt</h2>
            <p>{guide.attempt ?? "The supplied diff doesn’t establish an approach."}</p>
          </section>
        {/if}

        {#if guide?.verification}
          <details class="review-test">
            <summary>Test verification</summary>
            {#each guide.verification as result}
              <p><strong>{result.status}</strong> · <code>{result.command}</code></p>
              <pre>{result.message}</pre>
            {:else}
              <p>No test results were recorded for this guide.</p>
            {/each}
          </details>
        {/if}

        {#each sections() as section, sectionIndex (section.id)}
          {#if hideReviewed && section.files.length && section.files.every(reviewed)}
            <section class="reviewed-section">
              <h2>{section.title}</h2>
              <span>{section.files.length} {section.files.length === 1 ? "file" : "files"} reviewed</span>
            </section>
          {:else}
          {@const files = shownFiles(section)}
          {@const blockers = section.suggestions.filter((suggestion) => suggestion.severity === "blocker")}
          {@const shouldFixes = section.suggestions.filter((suggestion) => suggestion.severity === "should_fix")}
          {@const findings = [...blockers, ...shouldFixes]}
          {@const nits = section.suggestions.filter((suggestion) => suggestion.severity === "nit")}
          {@const previousPrompts = section.suggestions.filter((suggestion) => suggestion.severity === "check" || suggestion.severity === "question")}
          <section class="guide-section">
            <div class="guide-copy">
              <div class="section-number">{String(sectionIndex + 1).padStart(2, "0")} / {String(sections().length).padStart(2, "0")}</div>
              <div data-review-text={section.title}>
                <h2>{section.title}</h2>
                {#if section.summary}<p class="section-summary">{section.summary}</p>{/if}
                {#if section.focus}<p class="focus"><span>Ask yourself</span>{section.focus}</p>{/if}
              </div>

              {#if section.suggestions.length}
                <div class="suggestions">
                  <button class="suggestion-toggle" type="button" aria-expanded={!collapsedSuggestions[section.id]} onclick={() => toggleSuggestions(section.id)}>
                    <span class="chevron">{collapsedSuggestions[section.id] ? "▸" : "▾"}</span>
                    <span class="spark">✳</span>
                    <strong>Pair’s suggestions</strong>
                    <span class="suggestion-count">{findings.length} candidates · {nits.length} nits{previousPrompts.length ? ` · ${previousPrompts.length} older prompts` : ""}</span>
                  </button>
                  {#if !collapsedSuggestions[section.id]}
                    <div class="suggestion-group-title">Blockers and should-fixes</div>
                    {#if findings.length}
                      <div class="suggestion-list">
                        {#each findings as suggestion, i (`${suggestion.path}:${suggestion.line ?? ""}:${i}`)}
                          <button class="suggestion" onclick={() => goToSuggestion(suggestion.path, suggestion.line, suggestion.side)}>
                            <span class="suggestion-meta" class:severity-blocker={suggestion.severity === "blocker"} class:severity-should-fix={suggestion.severity === "should_fix"}>{suggestion.severity?.replaceAll("_", " ") ?? "review"} · {suggestion.path}{suggestion.line ? ` · ${suggestion.side ?? "line"} ${suggestion.line}` : ""}</span>
                            <strong>{suggestion.summary}</strong>
                            {#if suggestion.rationale}<span>{suggestion.rationale}</span>{/if}
                            {#if suggestion.next_check}<span class="next-check">Action: {suggestion.next_check}</span>{/if}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <p class="suggestion-empty">No blocker or should-fix candidates in this diff section.</p>
                    {/if}
                    {#if nits.length}
                      <button class="suggestion-subtoggle" type="button" aria-expanded={!!expandedNits[section.id]} onclick={() => toggleNits(section.id)}>
                        <span class="chevron">{expandedNits[section.id] ? "▾" : "▸"}</span>
                        <strong>Nits</strong>
                        <span class="suggestion-count">{nits.length} · low priority</span>
                      </button>
                      {#if expandedNits[section.id]}
                        <div class="suggestion-list">
                          {#each nits as suggestion, i (`${suggestion.path}:${suggestion.line ?? ""}:nit:${i}`)}
                            <button class="suggestion" onclick={() => goToSuggestion(suggestion.path, suggestion.line, suggestion.side)}>
                              <span class="suggestion-meta severity-nit">nit · {suggestion.path}{suggestion.line ? ` · ${suggestion.side ?? "line"} ${suggestion.line}` : ""}</span>
                              <strong>{suggestion.summary}</strong>
                              {#if suggestion.rationale}<span>{suggestion.rationale}</span>{/if}
                              {#if suggestion.next_check}<span class="next-check">Optional: {suggestion.next_check}</span>{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                    {#if previousPrompts.length}
                      <button class="suggestion-subtoggle" type="button" aria-expanded={!!expandedPreviousPrompts[section.id]} onclick={() => togglePreviousPrompts(section.id)}>
                        <span class="chevron">{expandedPreviousPrompts[section.id] ? "▾" : "▸"}</span>
                        <strong>Prompts from an earlier guide</strong>
                        <span class="suggestion-count">{previousPrompts.length}</span>
                      </button>
                      {#if expandedPreviousPrompts[section.id]}
                        <div class="suggestion-list">
                          {#each previousPrompts as suggestion, i (`${suggestion.path}:${suggestion.line ?? ""}:prompt:${i}`)}
                            <button class="suggestion" onclick={() => goToSuggestion(suggestion.path, suggestion.line, suggestion.side)}>
                              <span class="suggestion-meta">{suggestion.severity} · {suggestion.path}{suggestion.line ? ` · ${suggestion.side ?? "line"} ${suggestion.line}` : ""}</span>
                              <strong>{suggestion.summary}</strong>
                              {#if suggestion.rationale}<span>{suggestion.rationale}</span>{/if}
                              {#if suggestion.next_check}<span class="next-check">Look for: {suggestion.next_check}</span>{/if}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  {/if}
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
              {/each}
            </div>
          </section>
          {/if}
        {/each}
        <p class="closing">Pair’s suggestions are review candidates. Check each one against the PR’s goals and the available evidence.</p>
      {/if}
    </div>
  </div>

  {#if selectionOffer}
    <button class="selection-ask" style:left={`${selectionOffer.left}px`} style:top={`${selectionOffer.top}px`} onmousedown={(event) => event.preventDefault()} onclick={openChatFromSelection}>
      {selectionOffer.context.source === "note" ? "Ask Pair about this text" : "Ask Pair about these lines"}
    </button>
  {/if}

  {#if chatOpen}
    <SelectionChat label="Code review" context={reviewState().chat_context} messages={reviewState().chat}
      output={chatOutput} busy={chatBusy} error={chatError} bind:draft={chatDraft} onSend={sendChat} onClose={() => (chatOpen = false)} />
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
  .guide-opening { max-width: 1330px; margin: 0 auto; padding: 4px 0 20px; border-bottom: 1px solid var(--rule); }
  .guide-opening h2 { margin: 0 0 5px; }
  .guide-opening p { max-width: 75ch; margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
  .guide-opening p + h2 { margin-top: 14px; }
  .fallback-note { max-width: 1330px; margin: -10px auto 18px; color: var(--ink-faint); font-size: 11px; }
  .pair-working, .pair-error { max-width: 1330px; margin: 0 auto 14px; padding: 10px 13px; border-radius: 8px; background: var(--sidebar); color: var(--ink-soft); font-size: 12px; }
  .pair-working { display: flex; align-items: center; gap: 9px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: pulse 1.3s ease-in-out infinite; }
  .pair-error { color: var(--bad); background: var(--bad-soft); }
  .pair-error pre { max-height: 200px; overflow: auto; white-space: pre-wrap; font-family: var(--mono); font-size: 11px; }
  .review-test { max-width: 1330px; margin: 0 auto 16px; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 8px; background: var(--surface); color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; }
  .review-test summary { cursor: pointer; }
  .review-test p { margin: 6px 0; }
  .review-test pre { margin: 7px 0; max-height: 170px; overflow: auto; white-space: pre-wrap; font: 11px var(--mono); }
  .review-test > div { display: flex; justify-content: end; gap: 6px; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
  .guide-section { display: grid; grid-template-columns: minmax(270px, .8fr) minmax(0, 1.7fr); gap: 28px; max-width: 1330px; margin: 0 auto; padding: 30px 0 36px; border-bottom: 1px solid var(--rule); scroll-margin: 30px; }
  .guide-copy { min-width: 0; }
  .section-number { margin-bottom: 8px; }
  h2 { margin: 0 0 10px; font-family: var(--serif); font-size: 22px; font-weight: 500; letter-spacing: -.015em; }
  .section-summary { margin: 0 0 14px; color: var(--ink-soft); line-height: 1.55; font-size: 13px; }
  .focus { display: grid; gap: 4px; margin: 0 0 18px; padding-left: 10px; border-left: 2px solid var(--line); color: var(--ink); font-family: var(--serif); font-size: 14px; line-height: 1.45; }
  .focus span { color: var(--ink-soft); font-family: var(--sans); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .suggestions { margin: 18px 0; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--rule)); border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--mark) 35%, var(--surface)); }
  .suggestion-toggle { display: flex; align-items: center; width: 100%; gap: 6px; padding: 8px 10px; color: var(--ink); text-align: left; font-size: 11px; }
  .suggestion-toggle:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .suggestion-toggle strong { font-weight: 600; }
  .spark { color: var(--accent); }
  .suggestion-count { margin-left: auto; color: var(--ink-faint); font-size: 10px; }
  .suggestion-group-title { padding: 8px 10px 0; color: var(--ink-faint); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .suggestion-empty { margin: 0; padding: 10px; color: var(--ink-faint); font-size: 11px; }
  .suggestion-subtoggle { display: flex; align-items: center; width: 100%; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--rule); color: var(--ink-soft); text-align: left; font-size: 11px; }
  .suggestion-subtoggle:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .suggestion-subtoggle strong { font-weight: 550; }
  .suggestion-list { border-top: 1px solid var(--rule); }
  .suggestion { display: grid; width: 100%; gap: 5px; padding: 10px; text-align: left; color: var(--ink-soft); border-bottom: 1px solid var(--rule); font-size: 12px; line-height: 1.45; }
  .suggestion:last-child { border-bottom: 0; }
  .suggestion:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .suggestion strong { color: var(--ink); font-weight: 550; }
  .suggestion-meta { color: var(--accent); font-family: var(--mono); font-size: 10px; }
  .suggestion-meta.severity-blocker { color: var(--bad); }
  .suggestion-meta.severity-should-fix { color: var(--accent); }
  .suggestion-meta.severity-nit { color: var(--ink-faint); }
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
  .binary, .truncated { padding: 12px; color: var(--ink-faint); font-size: 12px; }
  .truncated { margin: 0; padding: 8px 12px; color: var(--bad); background: var(--bad-soft); }
  .reviewed-section { max-width: 1330px; margin: 0 auto; padding: 13px 0; display: flex; justify-content: space-between; align-items: baseline; gap: 14px; border-bottom: 1px solid var(--rule); color: var(--ink-faint); font-size: 12px; }
  .reviewed-section h2 { margin: 0; font: 500 14px var(--sans); color: var(--ink-soft); }
  .reviewed-section span { flex: none; }
  .closing { max-width: 1330px; margin: 22px auto; color: var(--ink-soft); font-size: 12px; }
  .selection-ask { position: fixed; z-index: 20; padding: 7px 10px; border: 1px solid var(--rule); border-radius: 7px; color: var(--bg); background: var(--ink); box-shadow: 0 5px 18px #0004; font-size: 11px; white-space: nowrap; }
  .selection-ask:hover { background: var(--accent); }
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
