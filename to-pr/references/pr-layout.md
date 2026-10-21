# PR layout — single, split, or genuinely dependent stack

This is Step 0 of `to-pr`, replacing the standalone split-to-prs and gh-stack skills.
Its output is an approved layout, or a decision that one ordinary PR is enough.

## 1. Inventory without changing work

Read repository instructions, `git status --short`, staged/unstaged diffs, and untracked paths.
Resolve the target remote and trunk from the user's instruction, existing PR, remote HEAD, and
available refs. Prefer `dev` when it exists and no stronger signal applies; never assume it exists.
Fetch the relevant remote if available; on failure, disclose that the inventory may be stale.

Inspect both local and remote refs, not just the checked-out branch:

```bash
git for-each-ref --format='%(refname:short) %(objectname) %(upstream:short)' refs/heads refs/remotes
git branch --no-merged <trunk>
git branch -r --no-merged <trunk>
gh pr list --state open --json number,title,headRefName,baseRefName,url
```

Deduplicate local/tracking refs for the same branch. A squash/rebase merge may leave a branch in
`--no-merged`; check PR merge history and patch equivalence before treating it as outstanding work.
A closed, unmerged PR is not automatically active. Other people's branches and unrelated work stay
untouched. A missing GitHub connection limits what can be concluded; say what could not be checked.

For plausible related branches, inspect their diffs, commits, ancestry/merge-bases, touched owners
(`CODEOWNERS` and equivalents), and declared PR bases. If a stack already exists, inspect
`gh stack view --json`. Do not run sync/rebase as a discovery command: they mutate state.

## 2. Choose the smallest useful layout

- **Single PR:** one coherent concern and reviewer boundary. Do not split solely for line count.
- **Independent PRs:** unrelated concerns/owners with no code dependency; each targets trunk.
- **Stack:** a real consumer needs an unmerged foundation. Show that dependency in the code or
  approved intent; shared filenames, branch age, or commit ancestry alone are insufficient.
- **Non-linear dependencies:** prefer separate stacks or a clear shared foundation, not an invented
  linear chain. Read [stack design](gh-stack/stack-design.md) before choosing layers.

Present branch → base, one-line scope, ownership, dependency evidence, and existing PR links for
all proposed layers. A small text dependency tree is enough. Explain why unrelated branches were
excluded. Ask for approval before creating/relinking branches, moving commits, or changing PR bases.
For view-only requests, report the inventory and stop. If no sensible split/stack exists, say so
and continue the normal single-PR flow.

## 3. Preserve work before executing an approved layout

Record each affected branch's current SHA in a durable local backup ref. Snapshot staged and
unstaged tracked work without altering the checkout:

```bash
SHA=$(git stash create "pre-to-pr-layout")
if [ -n "$SHA" ]; then
  git update-ref "refs/backup/pre-to-pr-layout-$(date +%s)" "$SHA"
fi
```

**That snapshot does not include untracked files.** Inventory them with `git ls-files --others
--exclude-standard -z`; copy affected files byte-for-byte to a private, recoverable backup outside
agent discovery and outside the Git index before moving them. Preserve paths and confirm the copy.
Do not sweep ignored files, credentials, or unrelated changes into a commit. Retain backup refs and
files until the user explicitly asks to remove them.

Use isolated worktrees and only approved commits/files/hunks for each slice. Stage named paths or
hunks, never `git add .` / `git add -A`. Ask before committing; approval of a split execution plan
must explicitly include commits. Never silently stash, reset, clean, delete branches, or force-push.
If a shared/published branch would require rewriting, explain the effect and ask separately; a new
branch is usually safer. Stop on conflicts and preserve the original work.

For stacking operations read the [gh-stack guide](gh-stack/guide.md). Check installed command help;
if the extension or stacked-PR support is unavailable, offer ordinary draft PRs with explicit base
branches, or stop. Installing an extension is a separate approval, not an implicit side effect.

## 4. Finish each PR using the parent skill

Run `to-pr`'s description/banner/proof steps for every approved slice, comparing each layer to its
own base. Submit drafts only; if stack submission already created a PR, update that PR rather than
opening a duplicate. Report branch/base/URL for every draft, remaining work in the starting checkout,
and backup locations. Merging and branch deletion are separate explicit operations.
