# Templates

Two ways in: **walk** (data only) and **scene** (a short script on the kit). Both play in the same
beat player.

## walk: code tracing, no JavaScript

Use when the change is *how the machine takes turns*: an event loop, a reducer, a scheduler,
blocking vs yielding, a request moving through middleware. Source on the left, the machine's state
as cards on the right, one step per beat. This is the schema `stepper.html` used, unchanged, so
existing walk JSON keeps working. Example:
[`../assets/examples/asyncio-create-task.walk.json`](../assets/examples/asyncio-create-task.walk.json).

```json
{
  "title": "create_task schedules work before the first await",
  "lede": "Two independent fetches overlap only if both tasks exist before anyone waits.",
  "panes": [
    { "id": "code", "title": "Python thread", "kind": "code", "lines": ["import asyncio", "", "async def main():"] },
    { "id": "loop", "title": "Event loop", "kind": "world" },
    { "id": "io", "title": "Timers", "kind": "world" }
  ],
  "steps": [
    {
      "caption": "`asyncio.run` starts the loop and enters `main`.",
      "highlight": { "code": [3] },
      "world": { "loop": [{ "id": "main", "title": "main()", "status": "running" }], "io": [] }
    }
  ]
}
```

- **Panes.** `kind: "code"` is a listing (`lines` is the whole example, kept short; the font shrinks to fit).
  Any other kind is a column of cards. One code pane plus one or two world panes is the usual layout.
- **Steps.** 8–24. `caption` is one teaching sentence (backticks become inline code). `highlight` maps a code
  pane id to 1-based line numbers. `world` maps a world pane id to that step's cards (omitted or empty →
  "Nothing scheduled.").
- **Cards.** `id` (stable across steps: a new id slides in, a changed status pulses), `title`, `status`
  (`ready` · `running` · `suspended` · `complete` · `io`), and either `lines` + `highlight` (a mini listing)
  or `note` (one line).
- Every step should visibly change something: a highlight, a status flip, a card arriving or leaving.

Assemble: `python3 scripts/assemble.py --walk <slug>.walk.json --out <out>`.

## scene: a concept metaphor

Use for everything else: a pipeline, a mechanism, a before/after, a data shape changing. Copy
[`../assets/examples/dbt-conveyor.html`](../assets/examples/dbt-conveyor.html). What it demonstrates:

| Beat | Pattern |
|---|---|
| 1 | an object enters; markers sweep the parts that matter |
| 2 | camera pulls out to an overview; the stage (belt, stations) builds |
| 3 | a copy peels off and travels while the camera tracks it; a column-by-column change |
| 4 | the trap: pull back, ring the thing that did *not* change |
| 5 | a row lifted out as a slip and dropped in a bin; the card shrinks |
| 6 | two rows merge into one; layers crossfade to a new shape |
| 7 | cut to a schematic panel over a scrim |
| 8 | the code beat: a navy panel, a coral underline on the line that matters, the same coral on the picture |
| 9 | the overview again; the run lights each stage in order |

Recipes for other metaphors (see the metaphor menu in `design-language.md`):

- **Swim lanes**: one `.tv-world` with N horizontal lanes (SVG rects); bars are `div`s whose `width`
  tweens over the beat; a serial beat runs bars one after another, a parallel beat runs them with the
  same start; a marker sweeps the finishing time.
- **Mailbox / queue**: a tray (SVG path) and letters (`.tv-card` minis) that `y`-drop in faster than a
  worker takes them out; overflow letters `rotation` off the edge; the caption names the rate mismatch.
- **Stack of cards**: cards `y`-stack upward on push and leave in reverse on pop; the top card is coral.
- **Before / after**: two halves of the hud with the same object; one beat per difference; ring the delta.

Assemble: `python3 scripts/assemble.py --scene <slug>.scene.html --out <out>`, or `--mode fragment` to
paste the player into a host page (the code-review explainer's figure slot).
