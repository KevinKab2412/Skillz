# Fault injection and recovery

## Suitable claims

Specified dependency failures, interruptions, or timeouts produce approved failure handling and
recovery: bounded retries, rollback, safe fallback, or eventual processing without data loss.

## Prerequisites

A failure model and recovery contract, an isolated environment, fault controls with guaranteed
cleanup, and observable durable state. Inject at an infrastructure seam while leaving the recovery
policy under test real. Process/network chaos requires explicit permission for that environment;
use local fixtures where sufficient and never target production by default.

## Independent reference and passing criteria

Source retry counts, timeouts, allowed partial effects, and recovery guarantees from approved policy.
Passing requires the named failure to actually occur, the expected response/state, and recovery
within the justified bound. Capture attempts, effects, and cleanup rather than only a final status.

## Execution recipe — illustrative transient timeout

Assumes an isolated `delivery` fixture with a controllable transport, real retry policy, and an
approved rule permitting exactly one retry after a timeout.

```python
def test_transient_timeout_recovers(delivery):
    delivery.transport.fail_next_with_timeout()
    result = delivery.send(message_id='example-1')
    assert result.delivered is True
    assert delivery.transport.attempts == 2
    assert delivery.persisted_delivery_count('example-1') == 1
```

```sh
python -m pytest tests/recovery/test_delivery.py -q
```

The fixture must restore controls even after failure. Add persistent-failure, rollback, and
crash/restart cases when required; a transport fake proves only the tested seam's policy.

## Known-bad check

Temporarily disable retry or duplicate the durable effect in an isolated patch. Confirm the relevant
assertion fails, restore, and rerun. Also confirm the fault was triggered, not bypassed.

## Blind spots

A simulated exception may differ from a real socket timeout or process death. Local success does
not establish production chaos resilience, all failure interleavings, or real dependency behavior.

## Official documentation

- [pytest fixture teardown](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [Toxiproxy](https://github.com/Shopify/toxiproxy)

Check installed-version controls and permissions. The fixture API is illustrative and unexecuted.
