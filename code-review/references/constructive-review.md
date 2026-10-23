# Constructive review — useful decisions, evidence, and closure

Read this before reviewing and again before composing comments. Adapted from Adrienne Braganza,
*Looks Good to Me: Constructive Code Reviews* (Manning, 2025). Chapter/section citations below name
the source principles; the workflow rules are our application of them, not quotations or universal
team policy. No access to the book is required to follow this reference.

## 1. Establish the contract before judging the code

Reviews protect maintainability, share knowledge, and preserve why decisions were made. Finding
bugs is one possible benefit, not an output quota (chapters 1–3). A thorough review may have no
findings. Keep the user's orientation and reading route even when no changes are requested.

Read the PR, tickets, relevant team agreement, existing review threads, and author replies. Identify
accepted tradeoffs, rollout constraints, and decisions that remain open. Distinguish a full merge
review from an early design consultation. A draft PR is not automatically ready for merge clearance.
A senior reviewer's comment adds relevant context; it is not proof by itself (chapters 2–4, 12–13).

Repository agreements govern review focus and merge policy. Personal skill defaults guide the agent;
they do not create team-wide rules. Do not turn book recommendations for PR size, reviewer count,
response time, or metrics into automatic rejection thresholds. Where policy is absent, state a
reasoned recommendation based on impact and scope rather than attributing it to the team.

## 2. Select comments before polishing them

Apply the book's 5P approach (section 6.1.1): pause, ponder, then pass, propose, or postpone.
For each candidate, answer:

1. What evidence supports it, and which requirement, guarantee, or maintained rule makes it matter?
2. What concrete consequence follows, for whom, and under which conditions?
3. Does resolving it belong in this PR now? Would a separate change be safe and more appropriate?
4. Is this new information, or has the author already acknowledged, resolved, or explicitly accepted it?
5. What outcome would resolve the concern without prescribing an unnecessary redesign?

Pass on unsupported preference or refactor-for-refactor's-sake. Postpone valuable out-of-scope work
as a clearly nonblocking follow-up; do not create tickets without permission. Propose supported,
scoped changes. No finding count, praise quota, or mandatory nit-hunting. A specific, sincere positive
observation is welcome when it teaches a useful choice; generic praise padding is not (section 6.3).

## 3. Separate type, evidence, and merge action

Do not infer priority or merge action from the fact that a probe failed.

| Dimension | Values / decision |
|---|---|
| Type | Correctness/security defect; maintainability concern; product/UX request; clarification; useful observation. |
| Evidence | Reproduced (name the boundary exercised); code-traced, not reproduced; documented rule/comparison; unresolved question. |
| Impact | State who is affected, realistic triggering conditions, consequence, and available mitigation. Avoid unsupported likelihood claims. |
| Action | Before merge; nonblocking follow-up; clarification needed; no action. Explain the reason and use team policy when present. |

Use these report classifications consistently across every lane:

- **Blocker:** a supported, significant correctness/security failure or core contract breach that
  should stop this merge under the applicable policy and realistic exposure. Explain why it cannot
  safely wait. A hypothetical or a reproduced low-impact defect is not automatically a blocker.
- **Should-fix:** a supported, scoped defect, maintainability issue, or agreed requirement gap worth
  addressing before merge, without overstating it as a hard blocker. Include the rationale.
- **Nonblocking:** a useful suggestion, genuine question, or deferred improvement. It does not enter
  the blocker/should-fix count. If a missing product decision prevents clearance, say what decision
  is needed; do not manufacture a confirmed code defect.
- **Nit:** inconsequential preference or tooling-enforced style. Omit it from the report.

A controlled interleaving test is not a production concurrency stress test. A synthetic fixture is
not evidence that a particular customer currently has that data. A code trace is not an executed
request. Keep those distinctions in the report and author-facing comment (chapter 13).

A test establishes observed behaviour, not the expected contract. Justify expectations independently
from requirements, established guarantees, or team decisions. For UX, verify the requested meaning
and ordering rather than inventing a required word. For design, use code comparisons, constraints,
and tradeoffs rather than fabricating a runtime reproduction (chapters 3, 5, 13).

## 4. Compose comments that the author can resolve

The book's Triple-R pattern is **Request, Rationale, Result** (section 6.1.3). Combine it with our
evidence-first preference:

- **Observation:** what I checked and what actually happened, with enough setup to understand it.
- **Rationale:** the violated contract or concrete consequence, not just a restatement of the code.
- **Request:** a collaborative, scoped adjustment: "can we…?" rather than blaming "you".
- **Result:** the observable condition that would resolve the comment.

Usually two to four short sentences are enough. Use paragraphs or a small reproduction block when
helpful; do not force a one-line run-on comment. Sentence order can vary for readability. Specify
the outcome first and offer an implementation only when useful, leaving room for a better solution.
Use transformation verbs such as reject, preserve, remove, consolidate, or clarify.

Make required action explicit. Follow the team's comment signals if they exist. Otherwise express
"before merge", "nonblocking", or "question" naturally where needed; do not impose a new label
system or put every kind of comment behind an ambiguous "what do you think?". The user's default
voice is conversational, lowercase, with code identifiers in backticks and a space before ` ?`.
Courtesy does not require pretending uncertainty about established evidence (sections 6.1–6.2).

The evidence should be inspectable from the PR: include minimal steps, inputs, actual/expected
results, or a small test excerpt. A local `/tmp` path or an uncommitted test name alone is not a
usable reproduction for the author or a durable record. Never claim an unrun test passed or failed.
Ask the author to adjust the code, not to establish an executable fact the reviewer can investigate.

### Examples — adapt, do not copy blindly

**Verified defect, controlled interleaving:**

> i reopened and extended the plan during a controlled evaluation run, and the old postmortem still
> saved. that leaves the reopened plan with an obsolete outcome and prevents a fresh evaluation
> after its revised end date. can we discard results when the plan changes during evaluation, so
> the reopened plan stays without a postmortem until its revised end date and can then be evaluated
> afresh ?

**Code trace, not an execution claim:**

> i traced `answer_check_in` through `_fill_unanswered`; unlike the dashboard path, it never checks
> the end date (not reproduced locally). this allows the ordinary reply path to bypass the stated
> scheduling rule. can we share that guard while preserving postmortem-note replies ?

**Maintainability comparison:**

> i compared both upload paths; storage and rollback repeat the same steps, so a change to failure
> handling needs to stay aligned in two places. can we consolidate those steps in the existing
> attachment service while keeping each owner's logging separate ?

**Genuine intent question, not an alleged defect:**

> question: both email modes currently suppress postmortem mail. should opted-in automatic sends
> also include a postmortem, or should that remain a separate opt-in? this is a delivery-policy
> decision rather than an accidental-send bug.

**UX request supported by rendered output:**

> following the requested email clarification, i rendered the message and the verdict comes before
> any explanation of the review. can we introduce the plan's end-of-plan review before the
> assessment in both versions? the wording can stay flexible.

**Earned positive observation:**

> keeping the calculated figures separate from model-written prose makes the saved assessment
> auditable without trusting the model to reproduce the numbers.

## 5. Discuss major changes; preserve decisions

Do not bury substantial architecture or product questions in dozens of line comments. Summarize the
uncertainty, explain why a focused discussion would help, and ask the user to involve the right
people. Do not schedule meetings or contact colleagues without permission. Once a decision is
provided, record its rationale and consequences in the review record; share it on the PR only when
authorized. Preserve rejected alternatives and rollout constraints (sections 8.5–8.6, 12.2).

On re-review, pin old and new commits, inspect the delta plus affected boundaries, and reconcile
findings as fixed, still open, refuted, or accepted/deferred by an authorized human. Do not mistake
"thread resolved" for "behaviour verified", or reopen an accepted tradeoff without new evidence.
If a topic is already raised, acknowledge or add genuinely new evidence in the existing discussion
when permitted. Draft-only permission never permits publishing a live reply to an issue comment.

Pairing, mobbing, and multiple agent passes can improve the work, but are not interchangeable with
independent human approval. Name self-review and same-thread rechecks honestly. Urgency never
silently removes a gate: explicit human risk acceptance should retain unresolved checks, rationale,
and follow-up rather than be reported as a clean pass (chapters 7, 10–13).

## 6. Evaluate the skill and its delivery

Automation should remove mechanical work, not manufacture certainty (chapter 5). Measure quality
through human-confirmed usefulness, false positives, clarity, and unnecessary rework; use counts and
speed as contextual signals rather than targets (section 9.2.5). No defect, comment, or praise quotas.

Structural tests protect instruction wiring, but cannot prove the model follows it. Use the synthetic
cases in `../evals/evals.json` to evaluate generated outputs: include no-finding reviews, unverified
hypotheses, genuine product questions, accepted tradeoffs, significant bugs, and evidence-supported
UX requests. Review whether the comment's claim, scope, consequence, and completion condition are
supported, not whether it parrots an exact phrase. Record limitations when behavioural runs are
unavailable; do not substitute string checks and claim behavioural coverage.

When changing this skill, update its canonical source, linked references, examples, and tests, then
sync every changed skill asset to the installed copy and verify content and discovery. Installation
checks should confirm the actual workflow available to users, not merely that source files changed
(section 9.2.3). Retain the full inline report; author-facing comments are a focused subset, never a
copy of the entire reading route or private agent planning.
