---
name: data-viz-selection
description: >-
  Pick the right chart for a dataset and message, then design it well. Walks the SlideScience / Analyst Academy charting decision tree from the analytical goal (comparison, relationship, distribution, composition, trend, single value) and the data's shape (time-based? how many variables? how many categories?) to a specific chart type and orientation — then layers on Storytelling-with-Data decluttering, focus, and an insight-stating title. Use whenever someone is choosing or second-guessing a visualization: "which chart should I use for this", "how should I visualize this data", "what's the best way to show X", "should this be a bar or a line chart", "pick a chart for these numbers", "is a pie chart right here", "how do I show this comparison / trend / breakdown", or hands you a table/metric and wants it turned into the right picture. Recommends and designs the chart in prose; it does not render the chart itself.
---

# data-viz-selection — choose the right chart, then design it well

> **Output discipline (hard rule).** Every output this skill produces obeys [`references/brevity/output-discipline.md`](references/brevity/output-discipline.md): **≤150 words of prose**, plain dumbed-down English, the recommendation first. Anything past 150 words becomes a **visual** — table, tree, diff, or code block (format menu: [`references/show-me/visual-formats.md`](references/show-me/visual-formats.md)). Words inside a visual don't count. Lead with the chart pick in one line; put the reasoning/alternatives in a small **table**, not paragraphs.

Most bad charts come from one mistake: picking the shape before naming the **message**. This skill
fixes the order. Start from *what you're trying to say*, let that plus the data's shape select the
chart, then apply universal design principles so the chart says it clearly.

Work in three steps: **name the goal → walk the tree → assemble the recommendation.**

## Step 1 — Name the analytical goal and the data's shape

Infer both from the user's question and any data they show. Ask only when genuinely ambiguous — and
when you do ask, ask about the *message*, not the chart.

**The goal** is one of six. It's the single most important choice; the rest of the tree hangs off it.

| Goal | The user is trying to… | Tell-tale phrasing |
|------|------------------------|--------------------|
| **comparison** | rank or contrast items against each other | "compare", "which is biggest", "X vs Y" |
| **relationship** | show how variables move together | "correlation", "does X drive Y", "relationship between" |
| **distribution** | show how values spread across a range | "spread", "how often", "outliers", "typical vs extreme" |
| **composition** | show parts of a whole | "breakdown", "share", "% of total", "made up of" |
| **trend** | show direction of change over time | "trend", "over time", "growing/declining", "trajectory" |
| **single_value** | land one number that matters | "what's our X right now", a single KPI |

Two boundaries blur often — resolve them deliberately:
- **comparison-over-time vs trend** — if the point is *the direction of change*, it's trend; if it's
  *contrasting several series' levels* across time, it's comparison (multiple line).
- **comparison vs composition** — "which category is biggest" is comparison; "how the total splits"
  is composition. If the parts must sum to a meaningful whole, it's composition.

**The data's shape** — gather only what the chosen goal's branch actually needs:
- *is it time-based?* (comparison, composition)
- *how many variables?* — 2 vs 3 (relationship, distribution)
- *how many items / categories?* — few (≤ 7) vs many (> 7) is the recurring cutoff (comparison,
  composition-over-time)
- *single or multiple series?* (comparison over time)

Also note, if the user offered it, the **one insight to highlight** and the **audience** (executive
vs analyst) — both feed the title and the focus choices in Step 3.

## Step 2 — Walk the decision tree

```
analytical_goal
├── comparison
│   ├── static (point in time)
│   │   ├── few items (≤ 7) ──→ Horizontal Bar Chart
│   │   └── many items (> 7) ──→ Column Chart          [variations: Stacked, Waterfall, Mekko]
│   └── over time
│       ├── single series ──→ Single Line Chart
│       └── multiple series ──→ Multiple Line Chart
│
├── relationship
│   ├── 2 variables ──→ Scatter Plot                   [variations: Heatmap, Paired Bar]
│   └── 3 variables ──→ Bubble Chart
│
├── distribution
│   ├── 1 variable ──→ Histogram
│   ├── 2 variables ──→ Scatter Plot
│   └── 3+ variables ──→ Box Plot / Violin Plot
│
├── composition
│   ├── static
│   │   ├── simple ──→ Pie / Donut (use sparingly)     [variations: Sunburst, Treemap]
│   │   └── additive ──→ Waterfall
│   └── over time
│       ├── few periods (≤ 7) ──→ Stacked Column
│       └── many periods (> 7) ──→ Stacked Area
│
├── trend ──→ Line Chart                               [variations: Multiple Line, Area, Stacked Area]
│
└── single_value ──→ Big Number / KPI Card
```

Land on exactly one chart. If the data legitimately supports two goals (e.g. it both compares and
shows a breakdown), say so, recommend the one that serves the stated message, and name the runner-up.

## Step 3 — Assemble the recommendation

Read [`references/chart-catalog.md`](references/chart-catalog.md) for the chosen chart's **formatting
tips** and **variations** — that file is the per-chart detail, kept out of here because any one call
only reaches one branch. Then layer on the universal principles below (they apply to *every* chart)
and write an insight-stating title.

### Universal design principles — apply to every recommendation

These come from *Storytelling with Data*. They aren't chart-specific; a good chart honours all three.

- **Declutter — remove anything that isn't carrying information.** No chart borders, no gridlines
  (or fade them to near-white), no 3-D, no drop shadows, no redundant data markers. Every pixel that
  isn't data or a needed label is noise competing with the message.
- **Focus attention — grey for context, ONE accent colour for the insight.** Push everything the eye
  doesn't need into light grey; spend a single saturated colour on the one thing you want seen.
  Colour, bold, and size are preattentive — the reader sees them before they read, so spend them only
  where the message lives. Label data directly instead of forcing a trip to a legend.
- **Tell the story — the title states the insight, not the data.** "Health-for-all campaigns convert
  at 2× the cost of the rest" beats "Signup rate by campaign type". Add a short annotation for the
  "so what" where it helps. Cut anything that doesn't serve the message.

### Two rules the eye can't forgive
- **Bar and column charts must start their value axis at 0** — a truncated bar lies about proportion.
- **Line charts need not start at 0** — they show *change*, so a zoomed axis is honest; forcing 0 can
  flatten the very trend that's the point.

### Output format

Present the recommendation like this — readable prose, not JSON:

```
## Recommended chart: <Label> (<orientation, if any>)
**Why this one:** <the goal → tree path in one sentence, e.g. "comparison, static, 5 categories → few items">

**Format it:**
- <tip from the catalog>
- <tip …>

**Design principles (apply all):**
- Declutter: <the 1–2 that bite hardest for this chart>
- Focus: grey for context, one accent colour on <the insight>
- Story: title states the insight

**Title:** "<insight-stating title — reuse the user's insight if they gave one>"

**Variations to consider:**
- <Variation> — when <condition>

**Runner-up (only if the goal was genuinely ambiguous):** <chart> — <when it would be the better call>
```

If the user gave an `insight_to_highlight`, the recommended title **is** that insight, lightly
tightened — that's the whole point of the story principle, so don't hand back a describe-the-data title.

## Done when

The recommendation names one chart with its tree path, carries that chart's real formatting tips (not
generic ones), applies all three universal principles with the accent colour pointed at the actual
insight, and hands back a title that *states the insight* rather than describing the axes. A pie or
donut recommendation always carries the "use sparingly — a bar is usually clearer" caveat.
