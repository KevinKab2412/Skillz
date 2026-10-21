# Glossary — Writing Great Skills

The domain model for what makes a skill great. A skill exists to wrangle determinism out of a stochastic system; the root virtue is **Predictability**, and every term below is a lever on it. Read this whenever the SKILL.md points at it — the terms are grouped by axis: **Invocation**, **Information Hierarchy**, **Steering**, and **Pruning**. Each **failure mode** lives beside the lever that cures it.

**Bold terms** in any definition are themselves defined here; find them by their heading.

## Predictability

The degree to which a skill makes the agent behave the same _way_ on every run — the same process, not the same output (a brainstorming skill should _predictably_ diverge; its tokens vary, its behaviour doesn't). The root virtue every other term serves — cost and maintainability are symptoms, not rivals.

_Avoid_: consistency, reliability, robustness, output-determinism

---

## Invocation

How a skill is reached — and the two loads you pay for the choice.

### Model-Invoked

A skill that keeps its **description**, so the agent can see it and fire it autonomously — and the human can still type its name. Pays a permanent **context load** on every turn in exchange for that discoverability. Reachable by other skills, because the description that makes it agent-discoverable makes it invocable. Pick model-invocation only when the agent must reach the skill on its own; if it never fires except by hand, drop the description and pay no context load.

_Avoid_: ability, tool, capability

### User-Invoked

A skill with its **description** stripped — invisible to the agent and reachable only by the human typing its name. Trades agent-discoverability for zero **context load**. Because it has no description, nothing but the human can reach it: no other skill can fire it. Mechanics: set `disable-model-invocation: true` in frontmatter; the description becomes human-facing.

_Avoid_: procedure, workflow, command

### Description

The skill's machine-readable trigger, and the one **context pointer** a **model-invoked** skill is forced to keep loaded at all times. Its mere presence _is_ the invocation axis: keep it and the skill is model-invoked; delete it and the skill is **user-invoked**.

_Avoid_: frontmatter, summary

### Context Pointer

A reference held in the agent's context that names some out-of-context material and encodes the condition for reaching it. The **description** is the top-level context pointer (context window → skill); pointers to disclosed files are the same object one level down. Its _wording_, not the target, decides when the agent reaches — and how reliably. A must-have target behind a weakly worded pointer is a variance bug: fix the wording first, inline only if sharpening fails.

_Avoid_: link, reference, import

### Context Load

The cost a **model-invoked** skill imposes on the agent's context window — its **description**, always loaded, spending both tokens and attention. What **user-invoked** skills escape by having no description, and the brake on splitting into more model-invoked skills.

_Avoid_: token cost, context bloat

### Cognitive Load

The cost a **user-invoked** skill imposes on the human — what they must hold in their head: which skills exist and when to reach for each (the human is the index). What **model-invocation** removes by being agent-discoverable, and the brake on splitting into more user-invoked skills.

_Avoid_: human index, burden, overhead

### Router Skill

A **user-invoked** skill whose job is to point at your other user-invoked skills — naming each and when to reach for it — so the human has one skill to remember instead of many. The cure for **cognitive load** when user-invoked skills multiply.

_Avoid_: dispatcher, menu, registry, index

### Granularity

How finely you divide skills. Finer division spends one of the two loads: more **model-invoked** skills spend **context load**; more **user-invoked** skills spend **cognitive load**. Two cuts guide division. By **invocation**, split off a model-invoked skill where you have a distinct **leading word** to trigger it. By **sequence**, split a run of **steps** where a step's **post-completion steps** need hiding.

_Avoid_: chunking, modularity

---

## Information Hierarchy

How a skill's content is arranged, and how far down the ladder each piece sits.

### Information Hierarchy

A skill's content ranked by how immediately the agent needs it — a single ladder, produced by two cuts: in-file or behind a pointer, and step or reference. The rungs:

- **Steps** — in-file, primary
- **Reference**, in-file — secondary
- **Reference**, disclosed — behind a **context pointer**

A skill with no **steps** uses just the bottom two rungs — often a legitimately flat peer-set (e.g. every rule of a review on one rung), which is fine, not a smell. Keep the top of the ladder legible; push down it whatever you can.

_Avoid_: structure, organization, layout

### Steps

The ordered actions the agent performs — when a skill has them, the primary tier of its content. Not every skill has steps: a skill can be all steps, all **reference**, or both. Every step ends on a **completion criterion**.

_Avoid_: workflow, instructions, choreography

### Reference

Material the agent refers to on demand — definitions, facts, parameters, examples, conditional instructions. When a skill has **steps** it is secondary to them; when a skill has none it is the entire content. Reached via **context pointers**, and the prime candidate for **progressive disclosure**.

_Avoid_: supporting material, docs, background

### External Reference

**Reference** that lives outside the skill system — a plain file, no **description**, no **steps**, not invocable — that any skill can point at. The home for shared reference that needn't fire on its own.

_Avoid_: doc, resource, knowledge base

### Progressive Disclosure

Moving **reference** down the ladder — out of SKILL.md and behind a **context pointer** — so the top stays legible. Not primarily a token optimisation; it's how the **information hierarchy** is protected. Licensed by **branching**: disclose what only some branches need, inline what every path needs.

_Avoid_: lazy loading, chunking

### Co-location

Keeping the material an agent needs at once in one place — a concept's definition, rules, and caveats under a single heading, not scattered — so reading one part brings its neighbours with it. The within-file companion to the **Information Hierarchy**.

_Avoid_: grouping, clustering, cohesion

### Sprawl

_Failure mode._ A skill that is simply too long, independent of whether the lines are stale or repeated. The cure is the **information hierarchy**: push **reference** down behind **context pointers**, and split by **branch** or sequence. Distinct from **sediment** (length from stale accumulation) and **duplication** (length from repeated meaning).

_Avoid_: bloat, length, size, verbosity

---

## Steering

The levers that shape the agent's runtime behaviour toward **Predictability**.

### Branch

A distinct way a skill can be invoked — a case the skill handles — so different runs take different paths through it. A skill with many steps may carry many branches; a linear one has none.

_Avoid_: path, case, fork

### Leading Word

A compact concept already living in the model's pretraining that the agent thinks with while running the skill (e.g. _lesson_, _fog of war_, _tracer bullets_, _red_, _tight_). Repeated as a token, never as a sentence, it accumulates a distributed definition across the skill and anchors a whole region of behaviour. Coining your own works if you define it clearly, but a made-up word recruits no priors — reach for an existing word first. Serves **predictability** twice: in the body it anchors execution; in the description it anchors invocation.

_Avoid_: keyword, term, motif

### Completion Criterion

The condition that tells the agent a unit of work is done. Two properties: **clarity** (can the agent tell done from not-done?) resists **premature completion**; **demand** (how much it requires) sets **legwork**. The strongest criteria are both checkable and exhaustive.

_Avoid_: done condition, exit condition, stopping rule

### Legwork

The work an agent does behind the scenes within a single step — reading files, exploring the codebase, digging up what it needs rather than offloading to the user. Latent in the wording, controlled by the agent. Raised by a **leading word** (_comprehensive_, _thorough_, _relentless_) or a **completion criterion** that demands exhaustive work.

_Avoid_: scope, effort, diligence, coverage

### Post-Completion Steps

The **steps** that follow the current step. Visible, they pull the agent forward into **premature completion**; the defence is to hide them by splitting the sequence.

_Avoid_: horizon, lookahead

### Premature Completion

_Failure mode._ Ending the current step before it's genuinely done, because attention slips to _being done_. Between-steps failure — needs **steps** to occur. Two levers hold it, in order: **sharpen the criterion first** (cheap, local); only if it's irreducibly fuzzy _and_ you observe the rush, **hide later steps** by splitting.

_Avoid_: rushing, shortcutting

### Negation

_Failure mode._ Steering by prohibition — telling the agent what _not_ to do — which drags the forbidden behaviour into context and makes it _more_ available, not less. _Don't think of an elephant_. Cure: prompt the **positive** — state the target behaviour so the banned one is never spoken.

_Avoid_: ironic rebound, don't-prompting, the pink elephant

---

## Pruning

Keeping a skill lean.

### Single Source of Truth

Each meaning lives in exactly one authoritative place, so a change to the skill's behaviour is a change in one place. **Duplication** is its violation.

_Avoid_: home, canonical location

### Duplication

_Failure mode._ The same meaning given more than one **single source of truth**. Costs maintenance and tokens, and inflates a meaning's prominence past its real rank. The accidental inverse of a **leading word**, which raises attention on purpose by repeating a token, never the meaning.

_Avoid_: repetition, redundancy

### Relevance

Whether a line still bears on what the skill does. A line loses relevance either by never bearing on the task or by going stale. Distinct from **no-op**: relevance asks whether a line bears on the task, not whether it changes behaviour.

_Avoid_: load-bearing, staleness

### Sediment

_Failure mode._ Layers of old content that settle in a skill and are never cleared, because adding feels safe and removing feels risky. The default fate of any skill without a pruning discipline.

_Avoid_: accretion, cruft, rot

### No-Op

_Failure mode._ An instruction that changes nothing because the model already does it by default — you pay load to tell the agent what it would do anyway. The test: does a line change behaviour versus the default? A weak **leading word** (_be thorough_ when the agent is already thorough-ish) is a no-op; the fix is a stronger word that passes the verdict (_relentless_).

_Avoid_: redundant instruction, restating the obvious
