---
name: architecture
description: >
  Diagnose and improve a codebase's architecture so humans and coding agents can change it safely.
  Trace real change pressure, find scattered knowledge and shallow modules, compare alternative
  interfaces, let the human choose, encode an architecture contract, and check completed work for
  drift. Use when a feature crosses unclear module seams, changes scatter across the repo, agents
  struggle to navigate the code, the user asks to improve or review architecture, or /pair needs a
  fence before granting implementation autonomy. Also supplies architecture exercises for /soc; it
  designs and judges but does not implement the refactor.
---

# Architecture — shape the terrain, then fence the work

Architecture is continuous human judgment about where knowledge lives, which policy is protected, and
which dependencies are allowed. This skill makes that judgment concrete enough for an agent to work
autonomously without quietly redesigning the system.

It has two modes:

- **Review** — diagnose one changing area, compare designs, and produce a human-approved architecture
  contract.
- **Checkpoint** — compare completed work with its contract and decide whether the next bounded batch
  is safe.

Use **review** by default. Use **checkpoint** when the caller provides a contract plus a diff or completed
slice. This skill designs and judges; [`implement`](../implement/SKILL.md) writes code.

## Workflow memory (nested stage)

`architecture` runs only as a nested stage of [`pair`](../../SKILL.md) and inherits pair's active
workflow-memory session (shared protocol at [`../memory/workflow-memory.md`](../memory/workflow-memory.md)).
It never opens, recalls, or flushes its own session — pair owns the session boundary. Memory remains
advisory and fail-open.

Recalled context is advisory. It cannot replace repository evidence, select an interface for the
human, approve or revise a contract, alter the supplied checkpoint batch, or decide or approve a
checkpoint gate. Filter every conflict in favor of those authorities so the architecture result is
reproducible without memory.

`architecture` may capture qualified events through the shared capture procedure — but only after an
accepted durable architectural decision, correction, constraint, or reusable lesson is persisted in
its authoritative repository or planning record. Persistence must succeed before capture; do not store
contract bodies, patches, gates, task state, unaccepted candidates, or unaccepted interface designs as
generic memory.

## Review mode

### 1. Scope from change pressure

Start with the user's named area. If none is named, inspect a meaningful stretch of git history and
choose the hot path developers repeatedly change. Read the relevant `AGENTS.md`, `CONTEXT-MAP.md`,
`CONTEXT.md`, ADRs, tests, and public interfaces before proposing structure.

Trace two or three representative changes through that area. Diagnose what developers actually
experience:

- **Change amplification** — one decision requires edits in many places.
- **Cognitive load** — safe work requires too much unrelated knowledge.
- **Unknown unknowns** — obligations or affected locations are hard to discover.

Name the underlying dependency or obscurity. Weight common work more heavily than rarely touched
complexity. File count, line count, and directory shape are not diagnoses.

### 2. Map the area through three lenses

Build one compact map:

- **Knowledge ownership** — which modules know each schema, invariant, protocol, policy, representation,
  lifecycle, or error rule? Flag knowledge repeated across modules.
- **Change ownership** — which code changes for the same actor, reason, and frequency? Code that changes
  together is a candidate to live together; different change pressures are a reason to separate.
- **Policy and detail** — which code expresses valuable domain policy, and which code is a replaceable
  database, framework, transport, UI, or vendor mechanism? Record the direction source dependencies
  currently point and the data types crossing each seam.

Use the project's domain language. A module is any coherent unit with an interface and implementation;
it may span several files or layers. Do not equate a module with a directory or class.

### 3. Present only earned candidates

Present at most three deepening candidates. Each candidate must contain:

```markdown
### <Candidate: domain name, not implementation name>
**Evidence:** the representative changes and files that exposed it
**Complexity:** amplification, load, or unknown unknowns and their cause
**Knowledge:** what decision is scattered and which module could own it
**Policy:** what is protected and which details stay outside
**Current interface burden:** everything callers must know today, including ordering and errors
**Expected gain:** what becomes local, hidden, or independently changeable
**Risk:** what this could make worse or prematurely fix
**Strength:** Strong | Worth exploring | Speculative
```

Apply the deletion test: if deleting the proposed module merely spreads its complexity back across
callers, it earns its place; if the complexity disappears, it was likely a pass-through. Prefer no
candidate over an unearned abstraction.

Ask the human which candidate to explore. Architecture remains the human's decision.

### 4. Design it twice

For the selected candidate, sketch at least two materially different module interfaces. Keep them
coarse: key operations, guarantees, errors, dependencies, and data crossing the seam. Do not write two
implementations.

Compare the designs on:

- caller cognitive load and common-case ease;
- knowledge hidden and change contained;
- whether adjacent layers express different abstractions;
- whether complexity moves into the owning module rather than every caller;
- dependency direction and policy protected;
- present usefulness without speculative extension points;
- testability through the same interface callers use.

The human chooses, combines, or rejects the designs. Record a durable ADR only when the choice is hard
to reverse, surprising without context, and the result of a real trade-off.

### 5. Write the architecture contract

After approval, produce the contract in [`references/CONTRACT.md`](references/CONTRACT.md). One contract
governs one architectural neighborhood and may authorize several related behavioral tasks; an epic may
carry multiple named contracts. The contract is the fence handed to `spec`, `implement`, and
`code-review`, not a full implementation plan.

Classify verification honestly:

- **Hard guards** express binary facts: forbidden dependency directions, cycles, private imports,
  outer data crossing inward, composition-root containment, contracts, types, builds, and tests.
- **Diagnostic signals** direct attention: coverage, mutation score, CRAP, cyclomatic complexity,
  fan-in/out, size, and interface counts. Promote one to a hard threshold only when the repository
  already has an intentional, configured policy for it.

Include an escalation condition for every decision the implementation agent must not make alone.

### 6. Update only stable orientation

After the human accepts the contract, update repository guidance only where the decision is durable:

- `CONTEXT.md` owns project-specific vocabulary.
- ADRs own surprising, hard-to-reverse trade-offs.
- The nearest `AGENTS.md` owns stable module responsibilities, dependency direction, required commands,
  and escalation conditions that code cannot make obvious.
- Tests and architecture checks own executable truth.

Keep implementation tours and generated file inventories out of `AGENTS.md`; they become stale and
duplicate the code.

## Checkpoint mode

Require the planning task number and an exact batch patch or immutable base/head commit range. A
cumulative working-tree diff is not enough: it can mix prior work or concurrent edits into the
checkpoint. If the caller cannot isolate the batch, stop and request an isolated patch before judging.

Given that contract and batch, compare prediction with reality:

1. Did the work deliver the bounded behavior through the selected interface?
2. Did it touch only the expected architectural neighborhood? Explain every extra area.
3. Does one module now own the intended knowledge, or did information leak?
4. Do source dependencies and boundary data obey the contract?
5. Did callers become simpler, or was complexity merely moved or wrapped?
6. What did implementation reveal that makes the contract wrong or incomplete?
7. Did every hard guard run and pass? Treat diagnostic signals as evidence, not verdicts.

Return exactly one gate:

- **Continue** — the contract held; the next related slice may proceed.
- **Reorganize first** — behavior works, but structural drift should be corrected before stacking work.
- **Human decision** — implementation exposed a policy, interface, or dependency choice outside the
  agent's authority.

If the contract changes, show the precise revision and ask the human to approve it before more work.

### Persist the gate

After the human accepts the gate, record it as a comment on the checkpoint task in `KevinKab2412/planning`:

```markdown
## Architecture checkpoint
**Batch:** <base/head range or exact patch path + digest>
**Gate:** Continue | Reorganize first | Human decision
**Hard guards:** <commands and results>
**Drift:** <predicted versus actual touchpoints and dependencies>
**Decision:** <why this gate>
**Approved contract revision:** <none, or exact revision>
```

When a revision is approved, also append it to the epic as `## Architecture Contract revision <N>` so
fresh implementation and review agents can retrieve the latest contract without conversation history.

- **Continue** — comment, then close the checkpoint task. If this checkpoint covered a cleanup task,
  close that task too.
- **Reorganize first** — comment and leave the task open. The caller creates a bounded cleanup task;
  checkpoint the combined exact patches and close both only after Continue.
- **Human decision** — comment and leave the task open. Resume only after the decision and any contract
  revision are approved and persisted.

## Relationship to other skills

- [`pair`](../../SKILL.md) invokes review mode only when a seam is new, crossed, or unclear, then
  invokes checkpoint mode at the contract's chosen cadence.
- [`soc`](../../../soc/SKILL.md) reuses these lenses but makes the human produce the map, alternatives, and
  contract before the agent critiques them.
- [`spec`](../spec/SKILL.md) persists the approved contract and cuts behavior-sized tasks inside it.
- [`implement`](../implement/SKILL.md) receives autonomy inside the contract and stops at escalation or
  checkpoint conditions.
- [`code-review`](../../../code-review/SKILL.md) treats unexplained contract drift as a substantive finding.

## Done when

Review mode is done when the human has chosen a design and each named contract states ownership,
interface, dependency direction, allowed neighborhood, predicted touchpoints, hard guards, diagnostic
signals, escalation conditions, and checkpoint cadence. Checkpoint mode is done when it returns one
gate against an isolated batch, the human accepts it, and the gate plus any revision are persisted.
