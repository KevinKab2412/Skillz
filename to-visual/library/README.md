# Concept library

Reusable concept cards and explanation patterns, so a new visual is mostly assembled, not invented.
Read a card before storyboarding a concept: it already says what the concept is for, the misconception
to stage as the trap beat, the operational principle to animate, and how it's usually drawn.

## Two places, one library

| Where | What | Who writes |
|---|---|---|
| `<to-visual>/library/` (this folder, shipped) | the seed: code-relevant concepts from Jackson's *The Essence of Software* and Litt's explanation patterns | edited in the Skillz repo, installed by `install.sh` |
| `~/.agents/to-visual/library/` (overlay, private) | concepts and patterns agents discover while explaining real changes | **agents, live**: no approval step, every entry tagged |

Look in both:

```bash
grep -ril "<term>" ~/.agents/skills/to-visual/library ~/.agents/to-visual/library 2>/dev/null
```

## Adding an entry (agents)

When you explain a concept or invent a visual pattern that isn't in either place, write a card to the
**overlay** (`~/.agents/to-visual/library/concepts/<slug>.md` or `patterns/<slug>.md`). Never write it to
this repo; it's public, and the overlay is where private code's concepts belong. Make it generic
where you can (name the concept, not the product), and **tag the origin**:

```
origin: <agent> <session date> · <repo>#<PR or path>
```

Kevin prunes or promotes overlay entries later. Promoting means rewriting the card generically and adding
it here in a commit.

## Card format

Frontmatter only, one `key: value` per line (plain text, not full YAML). `tags` is a `[a, b]` list.

**Concept cards** (`kind: concept`): `name`, `purpose` (what it's for, said first), `familiar_as`
(the known concept it's an instance of), `misconception` (the trap beat), `op` (operational
principle: the smallest scenario that shows the purpose being fulfilled), `state`, `actions`,
`syncs` (how it's usually composed), `visual` (how to draw it), `sources`, `origin`, `tags`.

**Pattern cards** (`kind: pattern`): `name`, `purpose`, `when`, `how`, `sources`, `origin`, `tags`.
