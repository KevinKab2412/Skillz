# Data reconciliation

## Suitable claims

A migration, import/export, or pipeline preserves approved records, relationships, totals, and data
quality across a specified source snapshot and target result.

## Prerequisites

An aligned source snapshot/watermark, documented transformations, stable business keys, and isolated
read access. Define late arrivals, deleted records, duplicates, timezone/currency conversion, and
permitted exclusions. Use sanitized fixtures for public examples and avoid copying production data.

## Independent reference and passing criteria

Derive expected rows/totals from independently reviewed source queries or fixtures, not the candidate
pipeline's own aggregation helpers. Reconcile per key or meaningful partition as well as globally.
Record row counts, missing/extra keys, duplicate keys, nulls, orphan relationships, and exact totals
or justified numeric tolerances. Passing requires all approved invariants at the named watermark.

## Execution recipe — illustrative keyed reconciliation

Assumes source/target fixtures return records for the same completed snapshot, with an approved
one-to-one mapping preserving integer cents and business keys.

```python
def test_completed_snapshot_reconciles(source_rows, target_rows):
    source = {row['business_key']: row['amount_cents'] for row in source_rows}
    target = {row['business_key']: row['amount_cents'] for row in target_rows}
    assert len(source) == len(source_rows)  # source keys must be unique
    assert len(target) == len(target_rows)  # target keys must be unique
    assert target == source
```

```sh
python -m pytest tests/data/test_snapshot_reconciliation.py -q
```

For large datasets, use reviewed read-only aggregate and anti-join queries plus targeted row checks;
report the exact snapshot and query definitions. Match decimal/null semantics deliberately.

## Known-bad check

Drop a fixture row, duplicate a key, or transfer cents between two rows while keeping the total
unchanged. Confirm keyed comparisons catch each relevant defect, restore, and rerun.

## Blind spots

Equal counts/totals can conceal wrong rows and offsetting errors. Misaligned snapshots produce false
alarms; an incorrect source is still incorrect. Sampling does not prove full-population equality.

## Official documentation

- [PostgreSQL aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

Use the actual engine's versioned SQL semantics. Example illustrative and unexecuted.
