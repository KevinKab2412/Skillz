"""The trace contract, and the pieces the Python recorders (Django, FastAPI) share.

Every recorder, in any language, writes the same JSON:

    {"meta": {"stack", "models", "labels", "recorded_at", "failures"},
     "tests": {"<test id>": [step, ...]}}

    step = {"caller": {"client": 1, "auth": "Bearer" | "none"},
            "method": "POST", "path": "/items/", "params": {...} | null,
            "status": 201, "response": {...} | null,
            "state": {"<Model>": [row, ...]},           # every named model, ordered by primary key
            "redirect": {"to": "...", "query": {...}}}  # only when the response redirects

A row maps column names to values. Values under a key in ``contract.json`` are shortened, datetimes
become seconds relative to the snapshot (``"+3600s"``, naive ones read as UTC), dates ISO strings,
decimals floats. Where the driver hands back datetimes as strings (SQLite under Knex or Eloquent),
the PHP and JS recorders treat datetime-looking strings the same way. ``meta`` may carry extras: a
``warnings`` list, and whatever locates the state (``settings``, ``db``). A test id ends with the
test's own name (``Class.test_name``, ``module.test_name``, or ``Suite › description``), which is
what a view spec's beats refer to.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

SECRET_KEYS = frozenset(json.loads(Path(__file__).with_name("contract.json").read_text())["secret_keys"])


def secret_keys(extra: str = "") -> frozenset:
    return SECRET_KEYS | {s for s in extra.split(",") if s}


def short(value) -> str:
    s = str(value)
    return s if len(s) <= 8 else s[:6] + "…"


def clean(obj, secrets):
    if isinstance(obj, dict):
        return {k: (short(v) if k in secrets and v not in (None, "") else clean(v, secrets)) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v, secrets) for v in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


def relative(value: datetime, now: datetime) -> str:
    if (value.tzinfo is None) != (now.tzinfo is None):
        value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
        now = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now
    return f"{(value - now).total_seconds():+.0f}s"


def cell(value, now: datetime, secrets, *names):
    if value is None:
        return None
    if any(n in secrets for n in names):
        return short(value)
    if isinstance(value, datetime):
        return relative(value, now)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (str, int, float, bool, list, dict)):
        return value
    return str(value)


def parse_json(content):
    if isinstance(content, (dict, list)) or content is None:
        return content
    try:
        return json.loads(content) if content else None
    except (ValueError, UnicodeDecodeError):
        return None


def redirect(location: str, secrets) -> dict:
    parts = urlsplit(location)
    return {"to": f"{parts.scheme + '://' if parts.scheme else ''}{parts.netloc}{parts.path}",
            "query": clean({k: v[0] for k, v in parse_qs(parts.query).items()}, secrets)}


class Clients:
    """Numbers the clients each test uses, in the order they first send a request."""

    def __init__(self):
        self.seen: dict[str, dict[int, int]] = {}

    def number(self, test: str, client) -> int:
        numbers = self.seen.setdefault(test, {})
        return numbers.setdefault(id(client), len(numbers) + 1)


def scheme(authorization) -> str:
    return authorization.split(" ", 1)[0] if authorization else "none"


def write_trace(path: str, stack: str, models: list, labels: list, failures: int, tests: dict, **extra) -> None:
    trace = {
        "meta": {"stack": stack, "models": models, "labels": labels,
                 "recorded_at": datetime.now().isoformat(timespec="seconds"), "failures": failures, **extra},
        "tests": tests,
    }
    with open(path, "w") as fh:
        json.dump(trace, fh, indent=1, default=str)
    steps = sum(len(v) for v in tests.values())
    print(f"recorded {steps} steps across {len(tests)} tests -> {path}")
