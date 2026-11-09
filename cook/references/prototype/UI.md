# UI Prototype

Generate **several radically different UI variations** on a single route, switchable from a floating
bar. The user flips between variants in the browser, picks one (or steals bits from each), then
throws the rest away. Use this when the question is **what should this look like** — appearance,
layout, information hierarchy.

If the question is about logic or state rather than appearance — wrong branch. Use [LOGIC.md](LOGIC.md).

## When this is the right shape

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- Any time the user would otherwise burn a day picking between three vague mockups in their head.

## Two sub-shapes — strongly prefer sub-shape A

A UI prototype is far easier to judge when it's **butting up against the rest of the app** — real
header, real sidebar, real data, real density. A route on its own is a vacuum where every variant
looks fine. Default to A whenever there's a plausible existing page to host the variants.

### Sub-shape A — adjustment to an existing page (preferred)

The route already exists. Variants render **on the same route**, gated by a `?variant=` URL search
param. Existing data fetching, params, and auth all stay — only the rendered subtree swaps. If the
thing being prototyped doesn't have a page yet but *would naturally live inside one* (a new section
of a dashboard, a new card, a new step in a flow), that's still sub-shape A — mount the variants
inside the host page.

### Sub-shape B — a new page (last resort)

Only when the thing genuinely has no existing page to live inside — an entirely new top-level
surface, or a flow that can't embed anywhere sensible. Create a **throwaway route** following the
project's existing routing convention (don't invent a new top-level structure); name it so it's
obviously a prototype (include `prototype` in the path). Same `?variant=` pattern. Before committing
to B, sanity-check that there's really no page to embed in — an empty route hides design problems a
populated one would expose.

## Process

### 1. State the question and pick N

Default to **3 variants**. Past 5 they stop being radically different and start being noise — cap
there. Write the plan in one line at the prototype's location: *"Three variants of the settings page,
switchable via `?variant=`, on the existing `/settings` route."*

### 2. Generate radically different variants

Variants must be **structurally different** — different layout, information hierarchy, primary
affordance — not just different colours. Three tweaked card grids isn't a prototype, it's wallpaper.
If two drafts come out too similar, redo one with explicit "do not use a card grid" guidance. Hold
each variant to the page's purpose, the data it has access to, and the project's component/styling
system (Tailwind, shadcn, MUI, plain CSS — whatever's there). Give each a clear exported name
(`VariantA`, `VariantB`, …).

### 3. Name the knobs

Variants answer "which structure", but most design questions also have a **continuous** dimension the
variants share — how wide, how dense, how much copy, how many rows. Those are **knobs**, and they
belong to the prototype rather than to any one variant: card width, gap size, item count, a
long-content toggle, a light/dark switch.

Pick knobs that turn an argument into a measurement. "Is the card too narrow?" is unanswerable in
prose and settled in four seconds by a width slider with a live readout. If a knob wouldn't change
anyone's mind, it's a distraction — leave it out.

Knob state lives in memory and does **not** need to be in the URL; only the variant does.

### 4. Wire them together

One drawer on the route:

```tsx
// pseudo-code — adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
const [knobs, setKnobs] = useState({ width: 380, count: 6, longCopy: false });
return (
  <>
    {variant === 'A' && <VariantA {...data} {...knobs} />}
    {variant === 'B' && <VariantB {...data} {...knobs} />}
    {variant === 'C' && <VariantC {...data} {...knobs} />}
    <PrototypeDrawer
      variants={['A', 'B', 'C']} current={variant}
      knobs={knobs} onKnobChange={setKnobs}
    />
  </>
);
```

Sub-shape A: keep all existing data fetching above the drawer; only the rendered subtree changes.
Sub-shape B: the throwaway route mounts the same drawer.

### 5. Build the prototype drawer

Model it on **Laravel Debugbar**: a persistent bar pinned to the bottom edge of the viewport that
expands into a panel. It is the prototype's entire control surface — variants, knobs, and the state
readout [SKILL.md](SKILL.md) rule 5 requires — in one place, so the user never hunts for controls in
two corners of the screen.

**Collapsed** (a slim bar, ~32px, full width): the current variant key and name, a hint of what's
inside (e.g. `Variants · Knobs · State`), and an affordance showing it opens. This state exists so the
user can see the design with *nothing* overlaying it — the whole point of being able to minimise.

**Expanded** (a panel, ~30–40vh, full width, above the collapsed bar): tabbed or columned sections.

- **Variants** — prev/next arrows that wrap, plus every variant key listed and clickable, current one
  highlighted. Clicking updates the URL search param via the framework's router (`router.replace`,
  `navigate`, …) so the variant is shareable and survives reload.
- **Knobs** — the controls from step 3, each with its live value beside it.
- **State** — computed and derived values, measurements taken from the live DOM where that's the
  honest way to answer the question, and any threshold warnings. This is what makes the prototype
  *readable* rather than merely clickable.
- **Copy** — a button that puts a paste-ready summary of the current setup on the clipboard: the
  variant, every knob value, and the state readout. This is the handoff back to the agent. Without
  it the user has to retype "C, but with the width at about 520 and six steps" from memory, and a
  verdict described from memory is a verdict that loses exactly the numbers the prototype existed to
  establish. Include the URL so the setup is reproducible, keep it to a dozen lines, and confirm the
  copy with a transient "Copied" state on the button so the user knows it landed.

**Behaviour:**

- Toggle by clicking the collapsed bar or the panel's header, and with a keyboard shortcut
  (`` ` `` or `Ctrl`/`Cmd`+`` ` ``). `Esc` collapses.
- Keep **Copy** on the collapsed bar, not just inside the panel — the user is most likely to want it
  right after collapsing the drawer to look at the design uncovered. Any control that lives on the
  bar must `stopPropagation` so clicking it doesn't also toggle the drawer.
- Use the async clipboard API with a hidden-`textarea` + `execCommand` fallback. A prototype opened
  from `file://` is not guaranteed a permissive clipboard, and a Copy button that silently fails is
  worse than none.
- **Persist the collapsed/expanded choice** (localStorage or equivalent) so it survives reload and
  variant switches. Start expanded on a first visit so the knobs are discoverable at all; respect the
  user's choice forever after.
- **Never cover the thing being judged.** When expanded, add bottom padding to the page equal to the
  drawer's height, the way Debugbar does — a variant partly hidden behind the drawer can't be
  evaluated. If the page has its own sticky footer, the drawer sits below it in the stack and the
  collapsed bar must not hide it.
- `<-` / `->` arrow keys cycle variants — but don't intercept them when an `<input>`, `<textarea>`,
  `<select>`, or `[contenteditable]` is focused.
- Visually distinct from the page (dark chrome, monospace for numbers) so it is obviously not part of
  the design being evaluated.
- Hidden in production builds — gate on `process.env.NODE_ENV !== 'production'` or equivalent, so a
  stray merge can't ship the drawer.

Put the drawer in one shared component both sub-shapes reuse, wherever shared UI lives. An
HTML-micro-world logic prototype ([LOGIC.md](LOGIC.md)) should reuse it too rather than growing its
own control panel.

### 6. Hand it over

Surface the URL, the `?variant=` keys, and which knobs answer which open question. Tell the user the
Copy button exists and that pasting its output back is the fastest way to hand you a verdict. The most
valuable feedback is usually **"I want the header from B with the sidebar from C"** — that's the
actual design they want, and it arrives with real numbers attached when it comes from Copy rather than
from memory.

### 7. Capture the answer and clean up

Once a variant wins, capture the answer and the prototype the way [SKILL.md](SKILL.md) describes.
The UI-specific mapping:

- **Sub-shape A** — fold the winner into the existing page, rewritten properly (it was built under
  prototype constraints). Delete the losing variants and the drawer from the route.
- **Sub-shape B** — promote the winning variant to a real route, then delete the throwaway route.

Never branch or commit the variants — the whole file goes to a gitignored directory instead (see
[SKILL.md](SKILL.md) capture step 2). Record the verdict (which variant, and why), **the knob settings
the verdict depends on** (a card width or density that the decision assumes is part of the decision),
and the one thing you now understand about the design that the mockups-in-your-head couldn't have told
you.

Expect the verdict to be a **mix** — "variant A, but with C's count strip" is the most common and most
useful outcome, not an inconvenience. When it happens, add the borrowed element to the winning variant
as a knob rather than hand-waving it, so the combination gets looked at before it gets specced.

## Anti-patterns

- **Variants that differ only in colour or copy.** That's a tweak. Real variants disagree about
  structure.
- **Sharing too much between variants.** A shared `<Header>` is fine; a shared `<Layout>` defeats
  the point — each variant should be free to throw out the layout.
- **Wiring variants to real mutations.** Read-only is fine; point any needed mutation at a stub. The
  question is "what should this look like", not "does the backend work".
- **Promoting prototype code straight to production.** Rewrite it properly when you fold the winner
  in.
