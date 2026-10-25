# Metamorphic testing

## Suitable claims

A justified transformation of inputs causes a predictable relationship between outputs. Useful when
exact expected results are expensive or unavailable, but domain relationships are well understood.

## Prerequisites

An approved domain relationship, valid transformations, and representative inputs. Confirm the
transformation preserves its assumptions: reordering is not neutral for every operation, and scaling
may interact with rounding, overflow, or thresholds.

## Independent reference and passing criteria

Derive the relationship independently from the implementation. State its applicable domain and exact
or justified numeric tolerance. Passing means all named transformed pairs satisfy the relationship;
retain explicit expected examples where available to anchor correctness.

## Execution recipe — illustrative order independence

Assumes the approved invoice rule is an order-independent sum of integer line totals, with no
position-dependent discounts. This is a deliberately narrow metamorphic relation.

```python
from example_app.invoice import total_cents

def test_line_order_does_not_change_total():
    lines = [{'cents': 1200}, {'cents': 300}, {'cents': 75}]
    assert total_cents(lines) == total_cents(list(reversed(lines)))
```

```sh
python -m pytest tests/test_invoice_relations.py -q
```

Expand transformations only when domain rules justify them. Record inputs and observed pair outputs.

## Known-bad check

Temporarily make the implementation ignore the last line. The given unequal first/last values should
cause this comparison to fail. Restore and rerun.

## Blind spots

A constant-output implementation satisfies many metamorphic relations. Combine with independently
specified examples or other properties. A false domain assumption can reject correct behavior.

## Official documentation

- [Hypothesis property examples](https://hypothesis.readthedocs.io/en/latest/quickstart.html)
- [pytest assertions](https://docs.pytest.org/en/stable/how-to/assert.html)

These document execution mechanisms; the domain supplies the relation. Example unexecuted; match
installed versions before use.
