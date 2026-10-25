# Concurrency and replay checks

## Suitable claims

Repeated delivery and concurrent operations preserve approved invariants, such as a single durable
charge per idempotency key, bounded inventory, or no cross-tenant effects.

## Prerequisites

Real relevant transaction/locking/idempotency mechanisms, independent sessions or workers, disposable
storage matching required database semantics, and controlled overlap. Define duplicate identity and
what happens if the same key arrives with a different payload. Use a barrier/latch or database
coordination instead of assuming parallel test scheduling creates a race.

## Independent reference and passing criteria

Source exactly-once effects, allowable responses, uniqueness constraints, and ordering promises from
the approved contract. Passing requires observed overlapping attempts or explicit replays, permitted
responses, and durable-state assertions. Record synchronization and repeat count.

## Execution recipe — illustrative replay case

Assumes an isolated real API/database fixture and an approved contract returning the same order for
replayed identical requests. This is a replay case, not proof of simultaneous execution.

```python
def test_replayed_order_has_one_effect(client, orders):
    payload = {'item': 'example-item', 'quantity': 1}
    headers = {'Idempotency-Key': 'example-key'}
    first = client.post('/api/orders', json=payload, headers=headers)
    second = client.post('/api/orders', json=payload, headers=headers)
    assert first.status_code in (200, 201)
    assert second.status_code in (200, 201)
    assert first.json()['id'] == second.json()['id']
    assert orders.count_for_key('example-key') == 1
```

```sh
python -m pytest tests/test_order_replay.py -q
```

For the concurrency claim, extend with two independent clients, a controlled overlapping execution
at the contested operation, and the same durable invariant. Assert overlap was reached; test-runner
parallelism alone is insufficient. Inspect permitted conflict responses rather than assuming both
requests must succeed.

## Known-bad check

Temporarily bypass deduplication for replay; confirm duplicate durable effects fail the case. For a
race case, temporarily remove the relevant atomic guard and demonstrate the coordinated schedule
catches the violation. Restore all changes and rerun.

## Blind spots

A sequential replay check misses races. Threads sharing one transaction/client may serialize work.
One coordinated schedule does not prove all interleavings or distributed exactly-once guarantees.

## Official documentation

- [Python threading barriers](https://docs.python.org/3/library/threading.html#barrier-objects)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

Consult the actual database, queue, and client docs for installed versions. Example unexecuted.
