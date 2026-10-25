# Contract testing

## Suitable claims

A provider and consumer agree on required request/response or event shapes, compatibility, and
observable interactions. Useful for APIs, webhooks, and independently deployed services.

## Prerequisites

An approved, versioned contract, representative interactions, and provider/consumer identities.
Distinguish schema validation from consumer-driven interaction verification. Use the repository's
existing OpenAPI/JSON Schema validator or contract runner, with safe local endpoints.

## Independent reference and passing criteria

The expected schema and interactions come from the approved public contract or reviewed consumer
requirements, independently of the provider implementation. Passing requires all named interactions,
including relevant errors, to satisfy the contract on the specified provider build. A schema generated
from the same candidate is not independent proof of backward compatibility.

## Execution recipe — illustrative schema boundary

Assumes pytest, `jsonschema`, a real local API client fixture, and a reviewed response schema file.
The schema should constrain the types and required fields relevant to the consumer.

```python
import json
from pathlib import Path
from jsonschema import validate

def test_catalog_response_contract(client):
    response = client.get('/api/catalog')
    assert response.status_code == 200
    schema = json.loads(Path('contracts/catalog-response.json').read_text())
    validate(response.json(), schema)
```

```sh
python -m pytest tests/contracts/test_catalog.py -q
```

Add request, error, and consumer/provider interaction cases as required. For consumer-driven tests,
verify the provider against the consumer's published expectations using the project's runner.

## Known-bad check

Remove a required field or change its type in an isolated provider fixture. Confirm validation fails,
restore, and rerun. Ensure the altered interaction is actually exercised.

## Blind spots

Schema-valid values can be semantically wrong. Permissive schemas and stub-only tests miss real
provider behavior; contract checks do not establish persistence, security, or visual correctness.

## Official documentation

- [JSON Schema validation](https://json-schema.org/understanding-json-schema/reference)
- [python-jsonschema validation](https://python-jsonschema.readthedocs.io/en/stable/validate/)
- [Pact verification](https://docs.pact.io/getting_started/how_pact_works)

Check installed validators and supported schema dialects. This recipe is illustrative and unexecuted.
