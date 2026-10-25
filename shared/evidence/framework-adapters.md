# Framework adapters — Pest and pytest

Use this reference after selecting a verification method. A framework supplies execution, fixtures,
and assertions; the approved requirement supplies the expected behavior. Reuse the repository's
runner rather than migrating its suite to fit a library example.

## Discover before writing

- Inspect manifests and lockfiles, test configuration, nearby tests, and CI commands. Record the
  installed runner and relevant plugin/framework versions. Check local CLI help within the existing
  environment when needed; do not install or upgrade dependencies just to inspect documentation.
- Consult official docs matching those versions for the features used. Read relevant assertions,
  fixtures/isolation, parametrization, plugin setup, and execution guidance, beyond installation.
  Rolling latest/stable docs are discovery links, not evidence of installed-version compatibility.
- Prefer versioned docs or official tagged source/docs when a rolling page differs. If sources are
  inaccessible, record that limitation and rely on verified local examples/help; distinguish
  observed compatibility from assumptions. Do not claim inaccessible docs were checked.
- Run focused checks first, then the caller's required guards. Report exact commands, environment,
  results, and skipped/unrun cases. Do not collect or execute unfamiliar repository code outside
  existing permissions merely to inspect a framework.

## Pest

Inspect `composer.json`, `composer.lock`, `phpunit.xml*`, `tests/Pest.php`, and nearby tests. Identify
`pestphp/pest`, PHP, PHPUnit, and any Laravel/browser plugins and their constraints. Match the
repository's `it()`/`test()` style and helpers. The Laravel plugin's HTTP/database helpers and browser
APIs have separate setup requirements; base Pest installation alone does not supply every example.

Use named datasets for case matrices, precise expectations for outputs, and isolated database state
when persistence is part of the claim. Validate the repository's test database before running
migration/reset helpers; use no production/shared database. Match database isolation to the
behavior under test. Check fixture setup, fakes, and assertions together so the test observes the
real mechanism of interest.

Typical existing-install command (adapt to repository scripts):

```sh
./vendor/bin/pest tests/Unit/DeliveryEligibilityTest.php
```

For Laravel projects, use their configured Artisan/Composer command when that is the convention.
Do not copy Pest 4 browser APIs into a project on an earlier release without verifying support.
The repository's Laravel-specific Pest 4 instruction preset is scoped guidance; it is not a global
requirement to use Pest, Laravel, or version 4.

Public sources:
- [Installation and requirements](https://pestphp.com/docs/installation)
- [Expectations](https://pestphp.com/docs/expectations)
- [Datasets](https://pestphp.com/docs/datasets)
- [Laravel plugin](https://pestphp.com/docs/plugins#laravel)

## pytest

Inspect `pyproject.toml`, the active lockfile/requirements, `pytest.ini`/`tox.ini`/`setup.cfg`,
`conftest.py`, and nearby tests. Identify pytest, Python, and relevant plugins, especially web-client,
async, database, and parallel execution plugins. Use the repository's virtual environment and runner
(e.g. its existing `uv run`, Poetry, tox, or direct Python command).

Use plain assertions with independently specified results, parametrization for case matrices, and
fixtures with deliberate scope and teardown. Share immutable setup where useful; isolate mutable
state across cases. Async support and framework/database helpers depend on plugins and settings;
verify those rather than assuming base pytest provides them. A monkeypatch of the behavior being
judged can make the test prove only its replacement.

Typical existing-environment command:

```sh
python -m pytest tests/test_delivery_eligibility.py -q
```

Public sources:
- [Installation](https://docs.pytest.org/en/stable/getting-started.html)
- [Assertions](https://docs.pytest.org/en/stable/how-to/assert.html)
- [Fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [Parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html)

## Source status

These are public discovery links, not vendored documentation. During initial authoring, the
Playwright visual-comparison page was retrieved successfully; requests to Pest installation and
pytest assertion pages returned HTTP 403; those inaccessible pages were not verified here. The
behavioral recipe was exercised with pytest 8.4.2 against a temporary generic implementation: all
three cases passed, and changing `>=` to `>` failed the boundary case. The Pest example passed PHP
syntax checking only; its runner/plugins and the browser recipe were not executed. These checks
do not establish compatibility with a caller's application: validate its installed versions locally.
