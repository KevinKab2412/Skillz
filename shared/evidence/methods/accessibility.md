# Accessibility checks

## Suitable claims

Named UI states meet specified automated accessibility rules and explicit keyboard/assistive-use
requirements. Useful alongside visual and behavioral checks; pixel similarity does not establish
accessible semantics or operation.

## Prerequisites

An approved target standard/level, actual rendered views, representative states, and the repository's
existing accessibility tooling. Include modal/error/expanded states and the intended keyboard flow.
Plan manual keyboard and assistive-technology checks for claims automation cannot establish.

## Independent reference and passing criteria

Source requirements from the approved accessibility target and relevant WCAG success criteria. Record
automated rule/tag selection, exclusions, browser, states, and manual outcomes. Passing an automated
scan establishes only that scan's result. Report manual criteria as passed/failed/untested separately;
do not claim full WCAG conformance from zero automated findings.

## Execution recipe — illustrative Playwright/axe scan

Assumes Playwright Test and `@axe-core/playwright` are installed, a local `baseURL` is configured, and
WCAG 2.2 AA is the approved target. Verify tag support in the installed axe version.

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('example form has no detected target-rule violations', async ({ page }) => {
  await page.goto('/example-form');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
```

```sh
npx --no-install playwright test tests/accessibility/example-form.spec.ts
```

Also traverse the form with keyboard alone: verify meaningful focus order, visible focus, activation,
error identification, and no trap. Test required screen-reader/browser combinations separately and
record actual results. Retain the shared policy's UI recording and evidence-safety rules.

## Known-bad check

Remove the accessible name from an otherwise unnamed input in an isolated fixture; confirm the
configured scan detects it. Introduce a safe keyboard trap to verify the manual case detects it,
then restore and rerun. Automated sensitivity does not establish manual coverage.

## Blind spots

Automated scans miss many usability, focus, interaction, and assistive-technology problems. A single
page state does not cover all dialogs/routes. Incorrect exclusions can hide real failures.

## Official documentation

- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Match installed APIs and the approved standard. Example illustrative and unexecuted.
