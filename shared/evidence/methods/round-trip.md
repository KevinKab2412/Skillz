# Round-trip checks

## Suitable claims

An encode/decode, serialize/parse, or export/import cycle preserves required information. Useful for
file formats, backups, and transfer boundaries.

## Prerequisites

A stated preservation contract, edge-case fixtures, and the real pair of public operations. Define
whether equality is byte-for-byte, structural, or semantic. Isolate database/filesystem side effects
and avoid overwriting real data during restore tests.

## Independent reference and passing criteria

Expected preserved fields come from the approved format and domain rules. Enumerate allowed loss or
normalization explicitly. Passing requires both the preservation assertion and any required format
conformance. Use independent, reviewed external fixtures or another reader/writer for compatibility
claims beyond a single implementation pair.

## Execution recipe — illustrative semantic round trip

Assumes `encode` and `decode` support the shown generic record without loss.

```python
from example_app.format import encode, decode

def test_record_survives_round_trip():
    record = {'name': 'Example café', 'count': 0, 'note': None, 'tags': []}
    assert decode(encode(record)) == record
```

```sh
python -m pytest tests/test_format_round_trip.py -q
```

Include unicode, empty/null values, precision boundaries, and ordering only where relevant to the
approved contract. For backups, restore into disposable storage and check actual recovered records.

## Known-bad check

Temporarily drop the `note` or `tags` field during encoding. Confirm the fixture fails after decoding,
restore, and rerun. Ensure fixtures distinguish null, absent, and empty where the contract does.

## Blind spots

Matching encoder/decoder bugs can cancel each other. Round-trip success does not prove standards
compliance, external interoperability, or restoration of untested metadata and dependencies.

## Official documentation

- [Python JSON encoder/decoder](https://docs.python.org/3/library/json.html)
- [pytest parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html)

Consult the actual format specification and installed library docs. Recipe illustrative and unexecuted.
