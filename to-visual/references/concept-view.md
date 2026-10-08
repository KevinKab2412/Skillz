# Concept view: digesting a code change

For a change an agent wrote (a PR, a branch, a diff) with runnable tests. The page has four parts,
in this order:

1. **Concepts this change touches.** Concept cards (NEW / CHANGED, purpose, familiar as, tests) plus
   a synchronization table: *when* one concept acts → *then* another acts → *evidence* (a test).
2. **Watch.** The central concept's operational principle, **recorded** from the change's own tests:
   each beat is one real request, each table row one real database row, and a chip names the test
   and step.
3. **Play.** A concept machine: the concept's actions as buttons, its state as tables, and a log
   that cites the test behind each rule.
4. **Check.** A quiz, with at least one question answerable only from the recording.

Reference example: [`../assets/examples/trash.view.json`](../assets/examples/trash.view.json), recorded
from [`../assets/examples/trash-django`](../assets/examples/trash-django) (ported to Laravel, FastAPI
and Express beside it).

## 1 · Name the concepts

Read the PR body, the file list and the **test names**. Agents usually name tests after behaviours,
so they are the best map. Group them into concepts in Jackson's sense: a unit of behaviour with
**one purpose**, its own state and actions, understandable on its own. Start from the library
(`library/`, then `~/.agents/to-visual/library/`), and reuse a known concept when it fits.

For each concept write a name, NEW or CHANGED, the purpose in one line, "familiar as" (a concept the
reader already knows), and the tests that cover it. Then list the **synchronizations**, the places
where one concept's action makes another act (consent "allow" → issue a code; revoke access → revoke
its refresh token), each with the test that proves it. Order the cards by dependence (explain
registration before the grant that needs it). Mark one concept with `star`: the one you'll record.
Internal mechanisms count as concepts here, because the reader is an engineer.

## 2 · Record the trace

Work on an **export**, never the reviewer's checkout, and install the project's dependencies there
with its own tool:

```bash
git -C <clone> fetch origin pull/<N>/head       # or the branch
mkdir -p <scratch>/pr && git -C <clone> archive <sha> | tar -x -C <scratch>/pr
R=<to-visual>/scripts/recorders
```

Then run the recorder for the project's stack. All four write the same trace (the shape is in
`scripts/recorders/tracekit.py`), so the rest of this page doesn't depend on the stack.

**Django**, from the directory with `manage.py`. It hooks the test `Client` and DRF's `APIClient`:

```bash
uv run --frozen python $R/record_django.py \
  --settings <project>.settings --models <app.Model,...> --out <scratch>/trace.json -- <test labels>
```

**Laravel** (PHPUnit ≥ 10 or Pest), from the directory with `phpunit.xml`. A PHPUnit extension
listens for each `RequestHandled` event and reads Eloquent models without global scopes, so
soft-deleted rows stay visible:

```bash
composer install --no-interaction
TOVISUAL_OUT=<scratch>/trace.json TOVISUAL_MODELS='App\Models\Item,App\Models\User' \
php -d auto_prepend_file=$R/laravel/autoload.php \
  vendor/bin/phpunit --extension 'ToVisual\Laravel\Recorder' <test files> [--filter …]
```

- For Pest, run the same command with `vendor/bin/pest`.
- `php artisan test` loses the `-d` flag, so call the runner directly.
- PHPUnit 10 has no `--extension` flag. Copy `phpunit.xml` to `phpunit.tovisual.xml`, add
  `<extensions><bootstrap class="ToVisual\Laravel\Recorder"/></extensions>`, and pass `-c phpunit.tovisual.xml`.

**FastAPI** (any Starlette app, pytest), from the project root, with its own environment
(`uv run --frozen`, `poetry run`, or the venv's `python -m`). A pytest plugin hooks `TestClient` and
`httpx.AsyncClient` on an `ASGITransport`, and reads SQLAlchemy or SQLModel tables through the
engine the app's session used:

```bash
PYTHONPATH=$R uv run --frozen pytest -p record_fastapi \
  --tovisual-out <scratch>/trace.json --tovisual-models <pkg.models:Item,...> <test paths>
```

**Express** (Jest + supertest), from the project root. The driver adds a setup file to the project's
own `setupFilesAfterEnv`, which hooks supertest. It reads state through the app's Knex instance or
Prisma client. `--models` takes `Label=table` for Knex and `Label=Model` for Prisma:

```bash
npm ci
node $R/jest/record.cjs --db <src/db.js> --models Item=items,User=users \
  --out <scratch>/trace.json -- <jest args>
```

Projects on native ESM need `NODE_OPTIONS=--experimental-vm-modules` in front.

- **Models** are where the concept's state lives (the tables you'll show). Pick 1–4. The trace keys
  each one by its short name (`Item`), which is what the view spec's `tables[].model` names.
- **Tests** are the ones whose names are the operational principle, plus one or two that show the
  trap. Run them first without the recorder if you're unsure they pass.
- Every recorder logs each request (caller, method, path, params, status, response, redirect) and
  snapshots the models after it. It shortens secret-looking values (`recorders/contract.json`) and
  shows datetimes relative to the snapshot. Check `meta.failures` and `meta.warnings` before you
  build on a trace.
- Beats name tests the way you'd say them (`test_deleted_item_can_be_restored`). `find_test`
  matches the exact id first, then the id's last part, then the same words. So the same spec finds
  `TrashTests.test_deleted_item_can_be_restored` and the Jest test
  `TrashTests › deleted item can be restored`. A parametrised test needs its exact name
  (`test_x[case]`).
- The four ports of the trash app (`assets/examples/trash-{django,laravel,fastapi,express}`) record
  the same trace. Read one when a recorder misbehaves on a real project.
- **Limits.** Only these test clients are recorded:
  - Django's test `Client` and DRF's `APIClient`;
  - Laravel's HTTP test helpers (`client` is always 1, and `actingAs` shows `auth: "none"`);
  - Starlette's `TestClient` and `httpx.AsyncClient` (one process, so no xdist);
  - Jest with supertest, reading Knex or Prisma (no Vitest or Mocha).

  For another stack, or tests that can't run, skip the recording and use a **walk** or a **scene**
  (say so).

## 3 · Write the view spec

Keep it next to the trace. Fields:

```json
{
  "id": "kebab-case", "title": "…", "kicker": "Concept view", "lede": "html",
  "concepts": [{"name", "status": "NEW|CHANGED", "purpose", "familiar", "tests", "star": true}],
  "order": ["registration → grant", "…"],
  "syncs": [{"when", "then", "evidence", "recorded": true}],
  "watch": {
    "trace": "trace.json", "intro": "html", "kicker": "concept · …", "headline": "…", "divider": "OTHER RECORDED TESTS",
    "actors": [{"id", "name", "sub"}],
    "routes": [{"method", "path": "/items/*/delete/", "params": {"grant_type": "refresh_token"},
                "from", "to", "label": "delete {p_name}", "res": "{status} · used {r_used}"}],
    "tables": [{"id", "model": "Item", "title", "widths": ["70px", "1fr"], "key": "id",
                "cols": [{"field", "label", "fmt": "value|duration|join|flag|short", "labels": [..], "map": {"substring": "text"}}]}],
    "beats": [{"test": "test_name", "step": 2, "caption": "≤ 12 words", "label": "optional override", "res": "optional", "trap": true}]
  },
  "play": {"intro": "html", "script": "machine.js"},
  "check_intro": "…",
  "check": [{"q", "tag": "from the recording", "options": [["text", true, "why"], ["text", false, "why"]]}]
}
```

- **routes** read the trace: the first route whose method, path glob (`fnmatch`) and params match a
  step decides who calls whom and the label. Templates take `{status}`, `{method}`, `{path}`,
  `{p_<param>}`, `{r_<response key>}`, `{q_<redirect query key>}`.
- **tables** turn model rows into columns. `duration` turns `+3600s` into `1 h`; `flag` picks a
  label by truthiness (`trashed_at` → "in the trash"/"your files"); `map` swaps substrings for words
  (a URL → "prod").
- **beats** pick test steps. Keep 6–12. Put the main operational principle first and the trap beats
  last with `"trap": true`; they sit under the divider.
- Diffs are automatic: a row is **new**, **changed** (marked in coral) or **gone** (struck through)
  compared with the previous step of the same test.

## 4 · Write the play machine

`play.script` is plain JS calling `V.machine(MACHINE, def)`. `MACHINE` is set for you. Model only the
concept's rules, each citing the test that proves it; the helper does the UI. Example:
[`../assets/examples/trash.machine.js`](../assets/examples/trash.machine.js).

```js
V.machine(MACHINE, {
  groups: [{ title: "You", controls: [{ select: "file", options: [["a", "file: a"]] }, { action: "create", label: "Create" }] }],
  tables: [{ id: "items", title: "Items", cols: ["id", "name", "where"], widths: ["50px", "150px", "1fr"] }],
  init: function () { return { seq: 0, items: [] }; },
  rows: function (s) { return { items: s.items.map(function (i) { return { key: i.id, cells: [i.id, i.name, i.where], dead: false }; }) }; },
  actions: { create: function (s, ui, log) { /* change s */ log(true, "create → 201", "why (test name)"); } },
});
```

Rows whose cells changed since the last action are highlighted automatically. Never claim a rule you
couldn't confirm in the code or a test; say "not claimed" in the log instead.

## 5 · Check, assemble, verify

Write 4–5 questions; tag the ones only the recording answers. Then
`assemble.py --view <spec> --out <out>` (or `--mode fragment` for code-review's explainer) and verify
per SKILL.md step 5. Keep the trace and spec in a gitignored place if the code is private: the
repo you write to may be public.
