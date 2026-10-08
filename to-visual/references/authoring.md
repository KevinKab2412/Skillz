# Authoring a scene

A scene is one file. `assemble.py` puts its style and markup inside the composition root, runs its
script after them, and inlines the kit, GSAP and fonts link around it. Start from
[`../assets/examples/dbt-conveyor.html`](../assets/examples/dbt-conveyor.html); it shows every
pattern below.

## File format

```html
<!-- to-visual scene
id: dbt-conveyor              (lowercase kebab-case; also the root element's id)
title: How dbt turns raw data into tables
kicker: Explain · dbt
-->
<style>  /* scope every rule under #<id> */
  #dbt-conveyor .tv-world { width: 3200px; }   /* a world wider than the frame, for camera pans */
</style>
<div class="tv-world"> …things the camera moves over (SVG layers, boxes)… </div>
<div class="tv-hud"> …fixed overlays: .tv-hk kicker, .tv-hh headline, panels, chips… </div>
<script>
(function () {
  var S = V.scene({ id: "dbt-conveyor" }), tl = S.tl;
  // build DOM, set initial state, then beats
  S.beat("One short caption.", 4.5, function (t) { tl.to(S.q(".box"), { x: 200 }, t + 0.3); });
  S.done();
})();
</script>
```

The kit adds the paper grain and the caption band. Captions come from `S.beat`; don't write them.

## Kit API (`assets/kit.js`)

| Call | Does |
|---|---|
| `V.scene({ id })` → `S` | Opens the scene on `#id`. One paused timeline: `S.tl`. |
| `S.beat(caption, dur, build)` | Adds label `bN` at the running end, crossfades the caption (HTML allowed: `<code>`), calls `build(t)` with the beat's start time. Position tweens absolutely: `t + 0.3`. |
| `S.cam(cx, cy, s)` | `{x, y, scale}` that centres world point (cx, cy) at scale s. `tl.to(S.world, Object.assign(S.cam(…), { duration: 1.5 }), t)`. |
| `S.mark(targets, at, extra)` | Sweeps coral markers (`.tv-mk`) in. |
| `S.draw(path, at, dur)` | Draws on a path prepared with `V.drawable(path)`. |
| `S.q(sel)` / `S.qa(sel)` | Query **inside this scene only**. Always target through these (or element refs): GSAP string selectors are document-wide and would hit other players on the page. |
| `S.done()` | Holds the last frame, registers `window.__timelines[id]`, boots the player. Call once, last. |
| `V.svg(tag, attrs, parent, text)` | SVG element helper. Put colours GSAP will tween in `style:"fill:…"`. |
| `V.table({ cols, rows, marks, cls, widths })` | One table version as a layer (`.tv-layer.<cls>`, rows `.r0…`, cells `.c0…`, header `.h`); `marks: [[row, col]]` get collapsed coral markers. |
| `V.ring(cx, cy, rx, ry)` | A hand-drawn ring path `d` (deterministic). |
| `V.drawable(path)` | Hides a path until drawn (stops a round cap showing as a dot). |
| `V.C` | Colour tokens: `ink cream tile tileStrong coral navy teal amber ok warn hair muted`. |

Kit classes ready to use: `.tv-box` + `.tv-tab .tl` + `.tv-card` (table card), `.tv-slip` (a row lifted
out), `.tv-hot` (static marker), `.tv-code` (`.bar`, `.dots`, `pre`, `.ln`, `.kw`, `.st`, `.nu`, `.ref`, `.ul`),
`.tv-panel`, `.tv-scrim`, `.tv-chip`, `.tv-k` (kicker), `.tv-hk` / `.tv-hh` (headline).

## Seek-safety (the player and a renderer both jump around the timeline)

- **Initial state with `gsap.set` before the beats**, never CSS `transform` on an element you tween.
- **Inside beats use only `tl.to`, `tl.set`, and `tl.from(..., { immediateRender: false })`.** No
  `tl.call`/`onComplete` that change state: seeks skip callbacks.
- **One layer per data version.** A table that changes is several stacked layers you crossfade or
  swap with `tl.set`, so every state exists in the DOM and scrubbing back restores it. Don't rewrite `innerHTML` mid-timeline.
- **No randomness or clocks:** no `Math.random`, `Date`, CSS animations or transitions. Use `V.ring` for hand-drawn shapes.
- **Scope CSS under `#<id>`** and query through `S.q`/`S.qa`; several players can share a page.

## Patterns that fixed real bugs

| Symptom | Fix |
|---|---|
| A removed row smears through its neighbour | Hide the row and show an opaque copy (`.tv-slip`) at the same spot; lift it out, then drop it. |
| A dot appears before a ring is drawn | `V.drawable(path)`: opacity 0 until `S.draw`. |
| A code panel half-covers a table | Move it so it covers the thing fully or not at all. |
| The world peeks past an overlay panel | Fade a `.tv-scrim` in behind the panel. |
| The overview sits high with an empty lower third | Lower the camera centre (≈ y 410 at scale 0.6). |

## Verify

The page exposes `window.__visual` (`beats`, `seekBeatEnd(k)`, `playBeat(k)`) and opens at a beat end
with `?beat=N` (`?beat=<id>:N` when a page holds several players). With the agent-browser tools:

1. open `file://…/<out>.html`, set a 1400×1000 viewport, read errors (expect none)
2. for N in 1…beats: open `?beat=N` (or eval `__visual.seekBeatEnd(N-1)`), scroll `.tv-viewport` to the top, screenshot
3. also screenshot one mid-beat moment of any beat with a complex move (a falling row, a merge)
4. play beat 1 for real (`click .tv-overlay`) and confirm the playhead stops at the beat boundary

Fix what you see, re-assemble, re-check. Report the beat count and that the check ran.

## HyperFrames compatibility

The root carries `data-composition-id`, `data-width/height`, and registers one paused GSAP timeline at
`window.__timelines[id]`: the HyperFrames composition contract. The live page doesn't need HyperFrames.
Rendering an MP4 with `npx hyperframes render` should be possible from the bare composition but is
untested; the player chrome would need stripping first.
