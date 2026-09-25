---
name: wayfinder
description: Plan a chunk of work too big for one session — wrapped in fog, where the way from here to the destination isn't visible yet — as a shared map of decision tickets on GitHub, then resolve them one at a time until the route is clear. Use for ambitious, foggy, multi-session planning: "I don't even know where to start with X", "this is too big to plan in one go", "chart a map for X", "help me wayfind X", or when a grilling session hits questions it can't answer without research, a prototype, or more discussion. The map and tickets are GitHub issues in the personal planning repo, so they're branch-independent and never make noise in a shared code repo. If the work fits in one session — you can already see the way — use /grill instead, not this.
disable-model-invocation: true
---

# Wayfinder

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, point first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. Show the map as a **tree or table of decision tickets**, not prose; keep the surrounding text under the cap.

A loose, ambitious idea has arrived — too big for one agent session, and wrapped in **fog**: the way
from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging
at the destination. This skill charts the way as a **shared map** of **decision tickets** — questions
whose resolution is a *decision*, not a slice of a build — and works them one at a time until the
route is clear.

If you can already see the way to the destination — the whole thing fits in one session — you don't
need a map. Use [`grill`](../grill/SKILL.md). Wayfinder is for when you *can't* see it yet.

## Where the map lives — always the personal planning repo

The map and every ticket are GitHub issues in **`KevinKab2412/planning`** (private), never in the code repo
you're working in. This is deliberate:
- **Branch-independent** — issues live on GitHub, not the working tree, so no branch checkout ever
  reshapes the map (the thing that made a committed-tracker unworkable for this).
- **No noise for collaborators** — a shared code repo's issue tracker stays clean; the map is
  unmistakably "Kevin's stuff" under his own account.
- **Glass box** — open maps, their sub-issues, and full history are visible in the GitHub UI without
  querying anything.

The map records which **code repo** the effort is *for* as a `Code repo:` line in its body, and
tickets cross-link back by URL. All concrete `gh` commands live in [GITHUB-OPS.md](GITHUB-OPS.md) —
read it when charting or resolving.

## Plan, don't do

Wayfinder is **planning**. Each ticket resolves a *decision*; the map is done when the way is clear —
nothing left to decide before someone goes and builds. The pull to just start building is usually the
signal you've reached the edge of the map: that's the handoff (to `/spec`), not a step you take here.

## The map

One GitHub issue labelled `wayfinder:map`. It's an **index, not a store** — it lists decisions made
and points at the tickets that hold their detail; a decision lives in exactly one place (its ticket),
so the map gists and links, never restates. Map body:

```markdown
## Destination
<what reaching the end looks like — the spec, decision, or change this effort finds its way to.
One or two lines; every session orients to it before choosing a ticket.>

## Code repo
<owner/repo this effort is for, or "n/a — non-code">

## Notes
<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far
<!-- the index — one line per closed ticket, enough to judge relevance, then open the link for detail -->
- [<closed ticket title>](issue-url) — <one-line gist of the answer>

## Not yet specified
<!-- fog of war: in-scope questions you can't ticket yet; graduates as the frontier advances -->

## Out of scope
<!-- work ruled beyond the destination; never graduates -->
```

Open tickets are **not** listed in the body — they're open sub-issues, found by query.

## Tickets — child issues, one 100K-token session each

Each ticket is a **sub-issue** of the map, carrying one `wayfinder:<type>` label. Its body is just the
question:

```markdown
## Question
<the decision or investigation this ticket resolves>

## Blocked by
<#N of each ticket that must close first, or "nothing">
```

A session **claims** a ticket by assigning it to the driver before any work, so concurrent sessions
skip it. **Blocking** uses a `blocked` label plus the `Blocked by #N` body line (add `blocked` when a
ticket has an open blocker; remove it when the last blocker closes). The **frontier** is the set of
open, unblocked, unclaimed sub-issues — the edge of the known, and what's takeable right now.

## Ticket types — each dispatches one of your skills

Every ticket is either **HITL** (worked *with* the human, who speaks for themselves — the agent never
answers its own questions) or **AFK** (agent alone).

- **`wayfinder:research`** (AFK) — a fact a decision waits on. Resolved by a [`research`](../research/SKILL.md)
  background agent. Fire these immediately when charting; they run unattended and report back.
- **`wayfinder:prototype`** (HITL) — raise fidelity with a cheap, concrete artifact to react to, via
  [`prototype`](../pair/references/prototype/SKILL.md). Use when "how should it look/behave?" is the question. Links the
  prototype branch as the asset. Prototypes are how a big up-front plan stays out of waterfall — they
  give high-fidelity feedback on what you're actually building.
- **`wayfinder:grilling`** (HITL) — a discussion to settle a decision, via [`grill`](../grill/SKILL.md)
  (with domain modelling). **The default type.**
- **`wayfinder:task`** (HITL or AFK) — real-world work that must happen before a decision can be made
  (provision access, sign up for a service so its API can be judged, move data so its shape is visible).
  The one type that *does* rather than decides, and it earns its place only by unblocking a decision.
  Resolved when done; the answer records what was done and any facts later tickets depend on.

## Fog of war

The map is *deliberately* incomplete — don't chart what you can't yet see. Beyond the live tickets is
the fog: decisions you can tell are coming but can't yet pin down because they hang on open questions.
Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets.

The map's **Not yet specified** section holds that dim view. The test for *ticket vs fog* is whether
you can state the question precisely now — **not** whether you can answer it:
- **Ticket** when the question is already sharp (even if blocked).
- **Not yet specified** when you can't phrase it that sharply yet — don't pre-slice the fog.

## Out of scope

The destination fixes the scope, so work beyond it is **out of scope** — not fog. It gets its own map
section: one line plus why it's out. When an existing ticket turns out to sit past the destination,
**close it** and leave a line in Out of scope; it stays out of Decisions-so-far (which records the route
actually walked). Out-of-scope work never graduates unless the destination is redrawn as a fresh effort.

## Invocation — two modes

**Never resolve more than one ticket per session** — except research, which runs AFK. Fresh session per
ticket keeps each inside the smart zone of the context window.

### Chart the map (user invokes with a loose idea)

1. **Name the destination.** Run [`grill`](../grill/SKILL.md) (with domain modelling) to pin what this
   map finds its way to — a spec, a decision, or a change. It recommends a spec for most build efforts.
   The destination fixes scope, so settle it first.
2. **Map the frontier** — grill again, **breadth-first**, fanning across the whole space to surface the
   open decisions and the first steps takeable now. **If no fog surfaces** — the way is already clear —
   stop: you don't need a map, use `/grill` → `/spec`.
3. **Create the map** issue (`wayfinder:map`) with Destination, Code repo, Notes filled, Decisions-so-far
   empty, the fog sketched into Not yet specified.
4. **Create the tickets you can specify now** as sub-issues, then wire blocking in a second pass (issues
   need numbers before they can reference each other). Everything you can't yet specify stays in the fog.
5. **Fire the research subagents** for every `wayfinder:research` ticket, in parallel — capture findings
   on a throwaway branch/file with a pointer from the ticket.
6. **Stop** — charting is one session's work; it hand-resolves nothing.

### Work through the map (user invokes with a map, optionally a ticket)

1. **Load the map** — the low-res index, not every ticket body.
2. **Choose the ticket** — the one named, else the first frontier ticket. **Claim it** (assign yourself)
   before any work.
3. **Resolve it** by dispatching the ticket's type-skill (research / prototype / grill / task). Zoom as
   needed: fetch related or closed ticket bodies on demand; consult the skills the Notes block names.
4. **Record the resolution** — post the answer as a comment, **close** the issue, and append a one-line
   context pointer to the map's Decisions-so-far.
5. **Advance the frontier** — remove `blocked` from tickets whose last blocker just closed; graduate any
   fog the answer made specifiable into fresh tickets (clearing it from Not yet specified); if the answer
   reveals a ticket sits past the destination, rule it out of scope; if it invalidates other tickets,
   update or delete them.

## When the map is complete — hand off

When no open tickets remain, the way to the destination is clear. Hand off by destination:
- **A spec** (the common case) → run [`spec`](../pair/references/spec/SKILL.md) *against the map*: it reads the closed
  decision tickets and their resolutions into a dense spec that **links back to each ticket as primary
  source** — so the implementer can read what was actually decided, not a lossy summary. Then `/pair`
  from spec onward (plan-review → implement → code-review → taste-review → polish) — `pair` ends in the
  polish, so a spec handoff needs no separate one.
- **A decision** locked for later → the map itself is the record; nothing more to produce.
- **A change made in place** → the tickets drove it; **polish** the change ([`polish`](../pair/references/polish/SKILL.md))
  so it reads as team-written — it both simplifies and de-noises, stripping bead/ticket refs, local-artifact
  mentions, and comment noise while simplifying naming and structure — then close the map. This is the last
  step whenever the map produced code directly rather than a spec.

The map is non-persistent in spirit: once its spec is in code, the spec issue can be closed. The map and
its decision tickets stay as the findable primary source.
