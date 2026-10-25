# Behavioral assertions

## Suitable claims

Establish that a specified input/action produces the required observable response, state change,
or rejection. Suitable for API/CLI contracts, validation, authorization matrices, and persistence.
Choose the highest practical public seam from the approved contract. For browser behavior, drive
the real interaction rather than inferring success from a backend-only test.

## Prerequisites

Read the approved behavior, relevant domain guidance, existing tests, and installed framework/plugin
versions. Prepare isolated fixtures, explicit starting state, and safe local test infrastructure.
Use real behavior at the boundary being tested; fake unrelated external side effects where useful.
Do not fake the authorization, transaction, or other mechanism whose correctness is the claim.

## Independent reference and passing criteria

Derive expected values from an approved rule, independently worked example, external contract, or
reviewed fixture. Avoid calculating expected output with the same implementation under test.
Enumerate representative success, rejection, boundary, and domain-failure cases. Assert exact public
outcomes and relevant side effects, including absence of unauthorized writes. A success status alone
cannot prove that the intended data was saved or that another actor is denied access.

Passing means every named case meets its explicit assertions. Follow the repository's coverage and
other guards, but distinguish coverage measurements from proof of the acceptance outcomes.

## Execution recipe — generic rule example

Illustrative approved rule: an order is eligible for free delivery at a subtotal of 5000 cents or
more. Below are alternative runner examples, not a request to add both frameworks. They assume the
named public function exists in the application. Adapt imports and paths to the repository.

Pest (`tests/Unit/DeliveryEligibilityTest.php`):

```php
<?php

use function App\Domain\Delivery\qualifiesForFreeDelivery;

it('applies the approved delivery boundary', function (int $subtotal, bool $eligible) {
    expect(qualifiesForFreeDelivery($subtotal))->toBe($eligible);
})->with([
    'below' => [4999, false],
    'at' => [5000, true],
    'above' => [5001, true],
]);
```

```sh
./vendor/bin/pest tests/Unit/DeliveryEligibilityTest.php
```

pytest (`tests/test_delivery_eligibility.py`):

```python
import pytest
from example_app.delivery import qualifies_for_free_delivery

@pytest.mark.parametrize('subtotal,eligible', [
    (4999, False), (5000, True), (5001, True),
])
def test_approved_delivery_boundary(subtotal, eligible):
    assert qualifies_for_free_delivery(subtotal) is eligible
```

```sh
python -m pytest tests/test_delivery_eligibility.py -q
```

Use the repository's actual environment runner instead when required. These small rule tests prove
only the boundary rule: an HTTP/browser feature must also exercise its relevant public entry point,
with response and persistence assertions as appropriate. Consult the
[framework adapters](../framework-adapters.md) before applying framework-specific features.

## Known-bad check

Temporarily change the boundary comparison from `>=` to `>` in an isolated patch; the 5000 case
must fail. Restore and rerun. For authorization claims, similarly prove that the denied-actor case
catches a safe, deliberate bypass in the local test environment. Retain the caller's stronger
mutation requirements where applicable.

## Blind spots

Passing examples do not prove all inputs, races, production integration, visual fidelity, or timing.
Mock-heavy tests may miss the real integration; transactional test fixtures can hide commit-time
behavior. Extend cases and methods according to actual domain risks, rather than claiming universal
correctness from this recipe.

## Official documentation

- [Pest expectations](https://pestphp.com/docs/expectations)
- [Pest datasets](https://pestphp.com/docs/datasets)
- [pytest assertions](https://docs.pytest.org/en/stable/how-to/assert.html)
- [pytest parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html)

Resolve these rolling documentation links to the installed version at use time.
