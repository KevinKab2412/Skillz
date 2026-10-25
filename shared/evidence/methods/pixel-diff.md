# Pixel diff

## Suitable claims

Establish that rendered pixels match an approved visual reference for named viewport/state cases.
Useful for layout, styling, and visual parity. Pair it with behavioral assertions for interactions,
authorization, persistence, and other nonvisual outcomes.

## Prerequisites

- An approved baseline with provenance: reference revision/build, view, state, and approval source.
  For a port, capture the approved reference independently of the candidate implementation.
- Matching browser/version, OS/container, fonts, viewport, device scale, locale, timezone, color
  scheme, and seeded data. Freeze clocks and randomness when relevant; disable animations and
  wait for fonts, images, and an explicit ready state. A fixed sleep is a weak readiness signal.
- Cases chosen from requirements: relevant routes, responsive widths, and loading/empty/error or
  interactive states. A screenshot of the initial page covers only that state.
- A safe test environment and an existing comparator. Use the project's tooling before adding any.

## Independent reference and passing criteria

A candidate screenshot becomes evidence only when compared with an approved reference. Generating
a new baseline from the candidate and accepting it automatically provides no independent parity
check. Missing baselines require establishment and review; report parity as untested until then.

Use the repository's approved tolerance. If none exists, start with exact comparison in a stable
environment and investigate differences. Any relaxation needs a documented reason grounded in
observed rendering noise and must still catch meaningful defects. Distinguish per-pixel color
sensitivity from total allowed differing pixels/ratio; record both effective settings. Mask only
identified nondeterministic regions and disclose the coverage loss. Avoid masking changed behavior.

Passing means every required case has been run within its justified tolerance, with actual,
expected, and diff artifacts inspected. Inspect baseline updates as deliberate expectation changes;
do not update snapshots or widen tolerances simply to turn a failure green.

## Execution recipe — illustrative Playwright Test example

Assumes the project already uses `@playwright/test`, has a configured local `baseURL`, and provides
a deterministic generic `/example-card` page with a heading named `Example card`. Match configuration
and APIs to the installed version. This example supplies no application or approved baseline.

```ts
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test('example card matches its approved reference', async ({ page }) => {
  await page.goto('/example-card');
  await expect(page.getByRole('heading', { name: 'Example card' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('example-card.png', {
    animations: 'disabled',
    threshold: 0,
    maxDiffPixels: 0,
  });
});
```

Save using the repository's test naming convention, for example `tests/visual/example-card.spec.ts`.
With dependencies already installed, a typical focused command is:

```sh
npx --no-install playwright test tests/visual/example-card.spec.ts --project=chromium
```

The project name must exist in the repository configuration; adapt the command to its actual setup.
Read that configuration for inherited screenshot options. Run the baseline and candidate in the
same rendering environment. Baseline creation/update is a separate, reviewed operation, not part
of the normal comparison command. Keep the existing UI recording requirement from the evidence
policy; screenshot comparison complements that capture.

## Known-bad check

In an isolated fixture or temporary local patch, introduce an obvious layout displacement in the
asserted region. Confirm the comparison fails for that case, inspect its diff, restore the change,
and rerun. A check that still passes may be pointing at another build, masking the region, or using
a tolerance that hides the defect. Record the observed result rather than assuming sensitivity.

## Blind spots

Pixel similarity does not establish DOM semantics, accessibility, keyboard operation, authorization,
network contracts, persistence, or correctness outside the captured states. Rendering differences
can produce false alarms; stale or incorrect baselines can make incorrect output pass. Ratios can
hide a small but important defect on a large page. Supplement with targeted semantic/behavior checks.

## Official documentation

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
- [Screenshot assertion options](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1)

These are rolling docs. Check APIs and effective defaults against the installed Playwright version.
