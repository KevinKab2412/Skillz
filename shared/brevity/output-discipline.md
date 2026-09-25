# Output discipline — 150 words, plain English, let a visual carry the rest

A shared reference for every skill that reports, explains, or recommends. The complaint this fixes:
as agents get smarter their prose gets **longer and denser** — walls of jargon the reader has to
wade through to find the one thing they needed. This module caps that, hard, and sends the overflow
into a picture instead. It pairs with the [`show-me`](../show-me/visual-formats.md) module: that one
gives the format menu, this one makes using it non-optional.

**Apply [`adhd-shaping.md`](adhd-shaping.md) alongside this, every time — not optional.** This module
caps *length*; that one shapes what's left so the reader can act on it without re-reading (lead with
the next action, number steps, restate state, make wins visible). A 150-word answer can still bury the
one thing to do next. Run both before you send text or an artifact.

## The hard cap

**Every output this skill produces is capped at 150 words of prose.** No exceptions — the terminal
message you read, a PR body, an explainer, a research write-up, a chart recommendation. Count the
prose. If you're over, you cut or you convert; you do not ship 151.

**Words inside a visual don't count.** Code blocks, diffs, trees, tables, Mermaid, an HTML file —
none of that burns your 150. This is the whole trick: the 150 words are the *thread that ties the
visuals together*, not the payload. Depth lives in the picture, which the reader parses almost for
free; the prose just points at it.

So when you run out of words, that's the signal to draw, not to write smaller. Over budget →

- a **table** for anything with rows and columns (findings, options, comparisons),
- a **tree / diff / Mermaid** for a shape or a flow (see the show-me format menu),
- a **code block** for anything literal (a signature, a command, a config),
- one **focused HTML file** when it's genuinely too dense for the rest.

## Dumbed down, on purpose

Write for a smart person who is **brand new to this** and shares none of the thread's jargon:

- **Short sentences. Plain words.** Prefer the everyday word over the clever one every time.
- **Spell out every acronym and domain term the first time**, in a handful of words.
- **Lead with the point.** First sentence = the answer or the verdict. No throat-clearing, no
  "In this response I will…", no restating the question back.
- **One idea per sentence.** If a sentence has two clauses fighting, split it.
- **Cut every word that isn't load-bearing.** Hedges, adverbs, "it's worth noting", "essentially",
  "in order to" — gone. Say the thing.

## Taste

- The cap is a feature, not a constraint to fight. If 150 words can't hold it, that's proof it
  belonged in a visual — that's the design working, not failing.
- A visual still needs its one short line of prose next to it; it is never the reader's *only*
  contact with the point, and never decoration. (Same taste rule as `show-me`.)
- Never pad to look thorough. A three-line answer that's right beats a page that buries it.
- If the skill's own instructions ask for a longer artifact, this still governs: keep its **prose**
  under 150 words and let its tables, diagrams, and code carry the depth.
