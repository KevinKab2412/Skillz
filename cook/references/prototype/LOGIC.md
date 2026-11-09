# Logic Prototype

An interactive artifact that lets the user drive a **state model by hand** — the kind of thing that
looks reasonable on paper but only feels wrong once you push it through real cases. Use this when
the question is about **business logic, state transitions, or data shape**, not appearance.

If the question is "what should this look like" — wrong branch. Use [UI.md](UI.md).

## When this is the right shape

- "I'm not sure this state machine handles the case where X then Y."
- "Does this data model actually let me represent the case where…?"
- "I want to feel out what this API should be before writing it."
- Anything where the user wants to **press buttons and watch state change** to decide if the model
  is right.

## Process

### 1. State the question

Before writing code, write down — in a top-of-file comment or a short README — the state model and
the exact question you're prototyping. A logic prototype that answers the wrong question is pure
waste, and the question is what you'll check the answer against later, whether the user is watching
now or returning to it AFK.

### 2. Isolate the logic in a pure, liftable module

Put the bit that actually answers the question behind a small, pure interface that could be lifted
out and dropped into the real codebase later. **The surface around it is throwaway; this module is
not.** That's what makes the prototype useful past its own lifetime — when the question's answered,
the validated module lifts into the real code on its own.

Pick the shape that fits the *question*, not whatever is easiest to wire to a UI:

- **A pure reducer** — `(state, action) => state`. Discrete events, single state value.
- **A state machine** — explicit states and transitions. When "which actions are even legal right
  now" is part of the question.
- **A small set of pure functions** over a plain data type. When there's no implicit current
  state — just transformations.
- **A class/module with a clear method surface** when the logic genuinely owns ongoing state.

Keep it pure: no I/O, no terminal or DOM code, no `console.log` for control flow. The surface
imports the module and calls into it; nothing flows the other direction. Use the host project's
language and conventions — don't add a new runtime or package manager just for the prototype.

### 3. Pick the surface — let the structure of the state decide

This is the step most people get wrong: they reach straight for a terminal loop, or straight for a
flashy browser app. Neither is a default. **Pick the representation that makes wrong behavior
obvious at a glance, then choose the lightest surface that delivers it.** Interactivity used as a
crutch is slop — a bad micro-world is worse than a plain text dump.

Before escalating past text, name the representation that would make the bug visible. If you can't
justify the escalation, drop back to text.

| The state is… | Surface | Why |
|---|---|---|
| **Discrete, readable field-by-field** (a reducer, a small machine) | **Text / TUI — drive live** | You read the state directly; anything heavier is noise. |
| **A trace where the transitions over time are the point** (a saga, a workflow, an event loop) | **Scrubbable timeline** | Replaying and inspecting each step is the whole insight. |
| **Geometric, graph-shaped, or about magnitudes** (coordinates, layout, a dependency graph, a schedule grid, a numeric curve) | **HTML micro-world** | Text flattens structure text can't show — this is the only tier a browser earns. |

This is the same escalation gate the code-review roadmap uses for micro-worlds — see
[`../code-review/references/future-ephemeral-interfaces.md`](../../../code-review/references/future-ephemeral-interfaces.md).
The one deliberate difference: code-review *replays a captured trace* of code that already exists;
here you *drive a live module* for code that doesn't yet. The module is the artifact under
construction, not an instrumented copy of something shipped.

### 4. Build the smallest surface that surfaces the state

Whichever tier you picked, two invariants hold: the logic module stays pure and liftable, and the
**full relevant state is visible after every step**.

- **Text / TUI (drive live).** On every tick, clear the screen and re-render the whole frame — one
  stable view, not growing scrollback. Frame = current state (pretty-printed, one field per line or
  formatted JSON; bold field names, dim derived/less-important values) then keyboard shortcuts at
  the bottom (`[a] add  [t] tick  [q] quit`). Read one keystroke, dispatch to a handler that calls
  the module, re-render. The whole frame fits on one screen.
- **Scrubbable timeline.** Drive the module to emit a trace of `{step, label, state}` records, then
  render a slider (or `[<-]`/`[->]` keys) that scrubs through them with the full state shown at each
  step. Never hand-fabricate the trace — write the tiny harness that produces it. Cap the step count.
- **HTML micro-world.** One self-contained HTML file: inline CSS/JS, any data embedded as a literal,
  no build step, no server, opens from `file://`. Let the user manipulate inputs (drag a point,
  toggle a flag) and watch the module's output update. Put those inputs and the state readout in the
  collapsible bottom drawer from [UI.md](UI.md) step 5 rather than inventing a second control panel —
  the micro-world needs to be viewable with nothing overlaying it just as much as a UI variant does.

### 5. Make it runnable in one command

Add a script to the project's existing task runner (`package.json`, `Makefile`, `justfile`,
`pyproject.toml`). The user runs `pnpm <name>` or equivalent — never a remembered path. If the
project has no task runner, put the exact command at the top of the prototype's README.

### 6. Hand it over

Give the user the run command (or the file to open). They drive it themselves — the valuable
moments are when they say "wait, that shouldn't be possible" or "huh, I assumed X". Those are bugs
in the *idea*, which is the whole point. If they want new actions or cases, add them. Prototypes
evolve.

### 7. Capture the answer and the prototype

Once it's answered its question, capture the answer and the prototype the way
[SKILL.md](SKILL.md) describes. The logic-specific mapping: the validated reducer / machine /
function set lifts into the real module (the decision, absorbed); the throwaway surface shell is
copied to a gitignored notes location — never branched, never committed. Record the verdict and the
one thing you now understand that prose couldn't have given you.

## Anti-patterns

- **Don't add tests.** A prototype that needs tests is no longer a prototype.
- **Don't wire it to the real database.** In-memory unless the question *is* persistence.
- **Don't generalise.** No "what if we want X later." It answers one question.
- **Don't blur the module and the surface.** If the reducer references `console.log`, prompts, or
  DOM code, it's no longer liftable. Keep the surface a thin shell over a pure module.
- **Don't escalate for spectacle.** A timeline or micro-world you can't justify against the gate is
  slop — drop back to text.
- **Don't ship the surface shell into production.** The shell is built for being driven by hand.
  The module behind it is the part worth keeping.
