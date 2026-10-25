# Differential testing

## Suitable claims

A replacement preserves approved behavior of a reference implementation across named cases. Useful
for ports, upgrades, migrations, and alternate algorithms; complements pixel diff for nonvisual parity.

## Prerequisites

An approved reference revision, separate reference/candidate environments, equivalent fixtures and
configuration, and a case corpus covering meaningful success, rejection, and state transitions.
Compare responses and relevant side effects. Use sanitized test data and isolated storage.

## Independent reference and passing criteria

Source the reference from an approved existing build or independent implementation. Record intentional
behavior changes as reviewed exceptions. Normalize only explicitly irrelevant variation, such as
unobservable generated request IDs; preserve meaningful ordering, values, errors, and side effects.
Passing means named observations agree except for those approved exceptions.

## Execution recipe — illustrative pytest comparison

Assumes `reference` and `candidate` fixtures are clients to two isolated builds, each freshly seeded
with the same generic catalog fixture. The example tests one read-only contract.

```python
import pytest

@pytest.mark.parametrize('path', ['/api/catalog', '/api/catalog/missing'])
def test_read_parity(reference, candidate, path):
    old = reference.get(path)
    new = candidate.get(path)
    assert new.status_code == old.status_code
    assert new.json() == old.json()
```

```sh
python -m pytest tests/parity/test_catalog.py -q
```

For writes, run each action against separate equivalent starting states and compare approved durable
outcomes and emitted effects. Do not send duplicate writes to shared systems merely to compare them.

## Known-bad check

Introduce an isolated change to a compared response field or side effect. Confirm the relevant case
fails; restore and rerun. Verify fixture clients really target different intended builds.

## Blind spots

Two implementations can share the same bug. Equality proves parity with the reference, not universal
correctness. Broad normalization can conceal regressions; untested states remain unsupported.

## Official documentation

- [pytest parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html)
- [Playwright API testing](https://playwright.dev/docs/api-testing)

Use installed-version APIs and the project's clients. The example is illustrative and unexecuted.
