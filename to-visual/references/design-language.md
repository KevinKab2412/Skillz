# Design language: code-editorial × Vox

Two registers on one stage. **Concepts** get a Vox-style explainer: physical metaphors, objects
that persist and change, a camera that pushes in for detail and pulls out for context, marker
highlights and hand-drawn rings. **Code** gets the code-editorial register: a warm-navy code surface,
monospace, and one coral accent that ties a line of code to the part of the picture it drives.

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
| **Show the trap** | One beat shows the misconception being wrong (for dbt: the raw table is still there, unchanged). |
| **Code beat, then behaviour beat** | Show the line, then show what it does, linked by the same coral. Code alone reads flat. |

## The look (code-editorial tokens, defined in `kit.css`)

- **Colours:** cream `#FAF9F5` ground · tile `#EFE9DE` / tile-strong `#ECE3D4` surfaces · ink `#141413`
  text and structure · coral `#CC785C` the one accent · navy `#181715` only for code surfaces.
  Syntax on navy: keywords muted cream, strings teal `#5DB8A6`, numbers amber `#E8A55A`.
- **Type:** EB Garamond for display (the headline, sentence case); Inter for captions and body;
  JetBrains Mono for labels, kickers (uppercase, `✱` in coral) and code.
- **Surfaces:** 1px hairlines and one soft shadow. No glows, no gradients on content.
- **Paper:** a faint grain on the ground (kit adds it). Hand-drawn rings use `V.ring` (deterministic wobble).

## Metaphor menu

Pick the metaphor whose *motion* matches the idea. The signature move is what the reader should remember.

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
