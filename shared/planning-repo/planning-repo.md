# Planning repo — files beside the issues

`KevinKab2412/planning` holds two things. Its **issues** are the index and the gates: wayfinder
maps, spec epics and task sub-issues. Its **files** hold what issues carry badly: Kevin's personal
standards, a living handoff log per effort, and the artifacts the effort produces. This module owns
where those files live and how skills read and write them. Callers own when they do it.

## Location and layout

The clone lives at `~/Documents/planning` (override with `PLANNING_DIR`). No skill names that path;
skills read it from here.

```
planning/
├── _global/
│   ├── standards/              Kevin's standards for every repo
│   └── cycles/                 efforts with no code repo (strategy, content)
└── <repo-key>/                 e.g. kevinkab2412-earmark
    ├── standards/              Kevin's standards for this repo (patterns.md, …)
    └── cycles/
        └── YYYY-MM-DD-<slug>/
            ├── summary.md      living handoff log (always present)
            └── …               mockups, review reports, screenshots, drafts
```

**Repo key**: `<owner>-<repo>` from the code repo's `origin`, lowercased
(`git@github.com:KevinKab2412/Earmark.git` → `kevinkab2412-earmark`). With no `origin`, use
`local-<dirname>`. `resolve-standards.sh` prints the key it derived.

These are Kevin's standards, kept out of team repos on purpose. A code repo's own
`CODING_STANDARDS.md` or `CONTRIBUTING.md` is the team's, and stays where it is.

## Reading

1. If `$PLANNING_DIR/.git` is missing, say so and give the fix:
   `gh repo clone KevinKab2412/planning ~/Documents/planning`. Carry on without the files, and
   name the gap in the output.
2. Pull before reading: `git -C "$PLANNING_DIR" pull --ff-only -q`. If it fails, read the local
   copy and say it may be stale.

## Standards — one resolver for every stage

Every stage that judges work against standards runs the resolver and uses everything it lists:

```bash
bash ~/.agents/skills/<skill>/references/planning-repo/resolve-standards.sh --repo <code-repo> [--ref <base>]
```

It pulls the clone, then prints three sections, each either file paths or `none found`:
`_global/standards`, `<repo-key>/standards`, and the code repo's own docs (`CODING_STANDARDS.md`,
`CONTRIBUTING.md`, `docs/standards*`, and the legacy `design-patterns/patterns.md`). With `--ref`,
code-repo matches print as `git:<ref>:<path>`; read them with `git show <ref>:<path>`. Exit 2 means
the clone is missing.

Pass the resolver's output to the judging step verbatim, including its `none found` and `MISSING`
lines. A stage may decide a source is irrelevant, but it says so. It never skips a source silently.

## Cycles — one folder per effort

A cycle is one effort with a start and an end: a spec epic or a wayfinder map. The caller that opens
the effort creates the folder:

- **Code work** → `<repo-key>/cycles/YYYY-MM-DD-<slug>/`, dated the day it opens, slug from the
  epic or map title.
- **No code repo** (map says `Code repo: n/a`) → `_global/cycles/YYYY-MM-DD-<slug>/`.
- **Spans repos** → the folder lives under the primary repo. Each other repo gets
  `<other-key>/cycles/YYYY-MM-DD-<slug>.md` holding one line: `→ <primary-key>/cycles/<folder>`.

The issue body carries the link back as a `Cycle:` line:
`Cycle: https://github.com/KevinKab2412/planning/tree/main/<repo-key>/cycles/<folder>`.

### summary.md

The first file a fresh agent reads. Create it with:

```markdown
# <effort title>

Epic/map: <issue URL>
Code repo: <owner/repo and branch, or n/a>

## Now
<the current stage and the next concrete action>

## Log
<!-- newest last; one entry per handoff -->
- YYYY-MM-DD <stage>: <what happened, decisions made, where artifacts went>

## Gotchas
<!-- what bit us, so the next agent doesn't repeat it -->
```

At each handoff (a stage finishes, a session stops, or the work pauses), rewrite **Now**, append one
**Log** line, and add any new **Gotchas**. Decisions stay in their issues; the log links to them.
Artifacts go in the cycle folder, never in the code repo.

## Writing

Commit and push only the paths you touched, with a message naming the cycle:

```bash
git -C "$PLANNING_DIR" add <paths>
git -C "$PLANNING_DIR" commit -q -m "<repo-key>/<folder>: <what changed>"
git -C "$PLANNING_DIR" push -q
```

If the push is rejected, pull with `--rebase` and push again. If it still fails, leave the commit
local and report it. The planning repo is private and personal, so this push needs no further
approval. Never write planning files into a code repo.
