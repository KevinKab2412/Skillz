# Property-based testing

## Suitable claims

An approved invariant holds across a generated range of valid inputs, such as conservation of a
subtotal or preservation of unique identifiers. Useful when handpicked examples miss combinations.

## Prerequisites

A precise domain invariant, generators covering the meaningful input domain, and an existing
property-testing runner. Include explicit boundary examples; inspect generator coverage and rejected
inputs. Use an installed tool such as Hypothesis, not a new dependency by default.

## Independent reference and passing criteria

Source the invariant from approved rules. Avoid rebuilding the implementation in the assertion.
Passing means the configured examples satisfy the property; record generator bounds, example count,
settings, seed/reproduction information, and any discarded inputs. This is sampled evidence, not a
proof for every input.

## Execution recipe — illustrative Hypothesis example

Assumes pytest/Hypothesis are installed and `example_app.split.allocate` divides nonnegative cents
among a positive number of recipients, returning one nonnegative integer allocation per recipient.

```python
from hypothesis import given, strategies as st
from example_app.split import allocate

@given(st.integers(0, 1_000_000), st.integers(1, 20))
def test_allocation_conserves_cents(total, count):
    parts = allocate(total, count)
    assert len(parts) == count
    assert all(type(part) is int and part >= 0 for part in parts)
    assert sum(parts) == total
```

```sh
python -m pytest tests/test_allocation_properties.py -q
```

Adapt imports and paths. Retain shrunk counterexamples as named regression cases.

## Known-bad check

Temporarily drop one cent from a nonzero allocation in an isolated patch. Confirm a generated or
explicit boundary case fails, restore the implementation, and rerun.

## Blind spots

An incomplete property can accept an incorrect implementation: conservation alone permits unfair
allocation. Generators can omit important inputs. Add fairness, ordering, rejection, or other claims
only when required, with independent expectations.

## Official documentation

- [Hypothesis quick start](https://hypothesis.readthedocs.io/en/latest/quickstart.html)

Resolve rolling docs against installed versions; the recipe is illustrative, not an executed check.
