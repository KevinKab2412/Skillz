# Design language: concepts first, code-editorial × Vox

The grammar comes from Daniel Jackson's concept design (*The Essence of Software*). The look is
code-editorial, with Vox's moves.

- **Concepts first.** Each animation shows one **concept**: a unit of behaviour with one purpose,
  its own state and actions. Its **operational principle** (the smallest scenario that shows the
  purpose being fulfilled) is the storyboard.
- **Explain through a familiar concept.** Say what the new thing is an instance of: a dbt model is a
  spreadsheet *formula*, and `ref()` is a cell *reference*. A physical metaphor (a conveyor belt) is
  an optional **skin** over that skeleton, never the explanation itself. Jackson: metaphors are "rarely
  useful for explaining what concepts are for".
- **Code** gets the code-editorial register: a warm-navy code surface, monospace, and one coral accent
  that ties a line of code to the part of the picture it drives.
- **Vox's moves** carry it: objects that persist and change, a camera that pushes in and pulls out,
  marker highlights, hand-drawn rings.

This is a trial (planning #1446, D3). To go back to metaphor-first, use the metaphor menu below as
the explanation, and keep the familiar concept as a one-line "familiar as…".

## Concept anatomy → the stage

| Concept part | On screen |
|---|---|
| purpose | the headline, said first |
| state | the objects that stay on screen (boxes, table rows, cards) |
| action | one motion = one beat |
| operational principle | the order of the beats |
| synchronization (A acts → B acts) | a visible wire, or the same coral on both ends |
| dependence | the order concepts are explained in (never explain upvote before post) |
| misconception | the trap beat: the reader's likely wrong concept next to the real one, stopping where they split |

## The rules

| Rule | In practice |
|---|---|
| **One idea per beat** | 6–12 beats, 4–7 s each (walk steps ~2 s). If a beat needs two captions, it's two beats. |
| **The picture carries the idea** | One caption per beat, ≤ 12 words, plain English. On-stage labels are 1–3 words. No paragraphs on stage. |
| **Objects persist** | The same box, card or node stays on screen and changes. Don't cut to a new slide when a transform will do. This is how the mental model forms. |
| **Motion = something happening** | Every move is an event in the concept: data travels, a row drops out, two rows merge, a value changes. No decorative motion, no bounce or elastic easing. |
| **Develop, don't freeze** | Each beat enters, develops, then settles: action first, emphasis last, then a short hold. Never put everything up at t = 0 and wait. |
| **One coral moment per beat** | Coral marks *what is changing now*: a marker swipe, a ring, a glowing segment, the linked line of code. Everything else is ink, cream and tile. |
| **Small concrete values** | 4 orders, 19.99, `2026-10-01`. Real-looking numbers you can check by eye. A visual that says "N rows" teaches nothing. |
| **Show the trap** | One beat shows the reader's likely wrong concept failing where the real one holds (trash: deleting frees no space until you empty it; dbt: the raw table is still there). The library card's `misconception` is the starting point. |
| **Code beat, then behaviour beat** | Show the line, then show what it does, linked by the same coral. Code alone reads flat. |

## The look (code-editorial tokens, defined in `kit.css`)

- **Colours:** cream `#FAF9F5` ground · tile `#EFE9DE` / tile-strong `#ECE3D4` surfaces · ink `#141413`
  text and structure · coral `#CC785C` the one accent · navy `#181715` only for code surfaces.
  Syntax on navy: keywords muted cream, strings teal `#5DB8A6`, numbers amber `#E8A55A`.
- **Type:** EB Garamond for display (the headline, sentence case); Inter for captions and body;
  JetBrains Mono for labels, kickers (uppercase, `✱` in coral) and code.
- **Surfaces:** 1px hairlines and one soft shadow. No glows, no gradients on content.
- **Paper:** a faint grain on the ground (kit adds it). Hand-drawn rings use `V.ring` (deterministic wobble).

## Metaphors: an optional skin

When a metaphor helps, pick the one whose *motion* matches the concept's operational principle, and
keep the familiar concept in the caption or headline. The signature move is what the reader should
remember. (This menu is also the documented way back if the familiar-concept trial is reversed.)

| Idea | Metaphor | Signature move |
|---|---|---|
| Transform pipeline (dbt, ETL, compiler passes, middleware) | **Conveyor belt** with stations | a box rides the belt; each station changes it a little; the source stays put |
| Concurrency, parallel vs serial | **Swim lanes** | a single lane splits into lanes; bars race; the parallel one finishes first |
| Queue, backpressure, async messaging | **Mailbox / inbox tray** | letters pile up faster than they're taken; the tray overflows |
| Call stack, recursion | **Stack of cards** | cards push on, then pop off in reverse |
| Caching / memoisation | **Two routes on a map** | the cold trip goes all the way to the database; the warm trip stops at the shelf |
| Event log, idempotency | **Ledger** | lines append; replaying the ledger rebuilds the same balance |
| State machine | **Rooms and doors** | a token walks from room to room; only labelled doors open |
| Retry / backoff | **Clock face + request arrow** | the arrow fails, the wait arc grows, the arrow tries again |

If nothing fits, compose from the kit: boxes that travel, layers that swap, markers that sweep,
paths that draw on, a camera that moves. Still one idea per beat.

## Framing (1920×1080 stage)

- **Zones:** headline 56–170 px from the top · content 200–890 · caption band 920–1020 · 80 px side pads.
- **Close-up:** camera scale 1, centred ~520 px down the world, so the subject sits between the headline and the caption band.
- **Overview:** scale ~0.6 centred ~410, so the whole world sits in the content zone without crowding the headline.
- **Panels** (code, schematic) must not half-cover something: either move them clear or cover the thing fully.
- **Overlays** over a moving world get a cream scrim behind them so the world doesn't peek out at the edges.

## Captions

One sentence, ≤ 12 words, saying what *this* beat changes. Inline code in `<code>` (walk captions: backticks).
Never a recap of the whole lesson. The caption and the motion say the same thing; if they disagree, fix the motion.
