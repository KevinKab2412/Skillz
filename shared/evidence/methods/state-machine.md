# State-machine testing

## Suitable claims

Sequences of actions obey approved transitions and invariants, including invalid actions. Useful for
workflow lifecycles, subscriptions, approvals, and stateful APIs.

## Prerequisites

An independent transition model, initial states, available actions, observable outcomes, and isolated
fixtures. Exercise real public operations. For generated stateful testing, bound sequence length and
record reproducible failing traces.

## Independent reference and passing criteria

Derive allowed/forbidden transitions from the approved lifecycle, rather than copying the production
transition table. Passing requires expected resulting states and effects after each action, plus
rejection without mutation for forbidden transitions. Name which paths were exercised.

## Execution recipe — illustrative sequence

Assumes an approved draft → submitted → approved workflow, with withdrawal forbidden after approval.
The `workflow` fixture supplies the real application boundary and its documented rejection exception.

```python
import pytest

def test_approved_item_cannot_be_withdrawn(workflow):
    item = workflow.create_draft()
    workflow.submit(item.id)
    assert workflow.get(item.id).state == 'submitted'
    workflow.approve(item.id)
    assert workflow.get(item.id).state == 'approved'
    with pytest.raises(workflow.InvalidTransition):
        workflow.withdraw(item.id)
    assert workflow.get(item.id).state == 'approved'
```

```sh
python -m pytest tests/test_workflow_sequences.py -q
```

Expand with alternate starts, repeated actions, and generated traces according to the approved model.
Persist minimal failing traces as regression examples.

## Known-bad check

Temporarily allow withdrawal after approval in an isolated implementation. Confirm the sequence fails,
restore, and rerun.

## Blind spots

An incorrect model yields incorrect expectations. Short or handpicked sequences miss longer histories;
sequential tests do not establish concurrent transition correctness or durable crash recovery.

## Official documentation

- [Hypothesis stateful testing](https://hypothesis.readthedocs.io/en/latest/stateful.html)
- [pytest exception assertions](https://docs.pytest.org/en/stable/how-to/assert.html)

Match installed versions and real application APIs. Example illustrative and unexecuted.
