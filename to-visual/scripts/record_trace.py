#!/usr/bin/env python3
"""Record a concept trace from a Django test run, from outside the repo under review.

Each request a test makes through Django's test ``Client`` (or DRF's ``APIClient``)
becomes one step: who called, the action, the params, the status, the response, and a
snapshot of the named models' rows right after it. Secret-looking values are shortened,
and datetimes are shown relative to the moment of the snapshot. Steps are grouped by
test, so a test name is the step's provenance.

Run it with the target project's own environment, from the directory that holds its
``manage.py``, on an export of the change (``git archive``), never on a reviewer's checkout:

    uv run --frozen python <to-visual>/scripts/record_trace.py \\
        --settings myproj.settings --models app.Model,other.Model --out trace.json -- <test labels>

Output: {"meta": {...}, "tests": {"Class.test_name": [step, ...]}}.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unittest
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

SECRET_KEYS = {
    "code", "code_verifier", "code_challenge", "token", "refresh_token", "access_token", "id_token",
    "client_id", "client_secret", "registration_access_token", "token_checksum", "key", "jti",
    "password", "secret", "api_key", "session_key",
}
METHODS = ("get", "post", "put", "patch", "delete")


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--settings", default=os.environ.get("DJANGO_SETTINGS_MODULE"), help="Django settings module")
    ap.add_argument("--models", required=True, help="comma-separated app_label.Model whose rows are the concept's state")
    ap.add_argument("--out", required=True, help="trace JSON to write")
    ap.add_argument("--secrets", default="", help="extra comma-separated field/param names to shorten")
    ap.add_argument("labels", nargs="*", help="test labels, after --")
    args = ap.parse_args(argv)
    if not args.settings:
        ap.error("--settings is required (or set DJANGO_SETTINGS_MODULE)")
    return args


def short(value) -> str:
    s = str(value)
    return s if len(s) <= 8 else s[:6] + "…"


class Recorder:
    def __init__(self, models, secret_keys):
        self.models = models
        self.secret_keys = secret_keys
        self.tests: dict[str, list] = {}
        self.clients: dict[str, dict[int, int]] = {}
        self.busy = False

    # -- values ------------------------------------------------------------------------
    def clean(self, obj):
        if isinstance(obj, dict):
            return {k: (short(v) if k in self.secret_keys and v not in (None, "") else self.clean(v)) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self.clean(v) for v in obj]
        if isinstance(obj, (str, int, float, bool)) or obj is None:
            return obj
        return str(obj)

    def cell(self, field, value, now):
        if value is None:
            return None
        if field.name in self.secret_keys or field.attname in self.secret_keys:
            return short(value)
        if isinstance(value, datetime):
            return f"{(value - now).total_seconds():+.0f}s"
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, (str, int, float, bool, list, dict)):
            return value
        return str(value)

    def snapshot(self):
        from django.utils import timezone

        now = timezone.now()
        state = {}
        for model in self.models:
            fields = model._meta.concrete_fields
            state[model.__name__] = [
                {f.attname: self.cell(f, getattr(obj, f.attname), now) for f in fields}
                for obj in model._default_manager.order_by("pk")
            ]
        return state

    # -- provenance ----------------------------------------------------------------------
    @staticmethod
    def current_test():
        frame = sys._getframe(1)
        while frame:
            owner = frame.f_locals.get("self")
            if isinstance(owner, unittest.TestCase):
                return f"{type(owner).__name__}.{owner._testMethodName}"
            frame = frame.f_back
        return "unattributed"

    def caller(self, test, client):
        numbers = self.clients.setdefault(test, {})
        number = numbers.setdefault(id(client), len(numbers) + 1)
        auth = (getattr(client, "_credentials", None) or {}).get("HTTP_AUTHORIZATION") or (
            getattr(client, "defaults", None) or {}).get("HTTP_AUTHORIZATION", "")
        return {"client": number, "auth": auth.split(" ", 1)[0] if auth else "none"}

    # -- the hook ------------------------------------------------------------------------
    def record(self, client, method, path, data, response):
        payload = data
        if isinstance(data, (bytes, str)):
            try:
                payload = json.loads(data)
            except ValueError:
                payload = None
        try:
            body = json.loads(response.content) if response.content else None
        except (ValueError, UnicodeDecodeError):
            body = None
        test = self.current_test()
        step = {
            "caller": self.caller(test, client),
            "method": method,
            "path": path.split("?", 1)[0],
            "params": self.clean(payload) if isinstance(payload, (dict, list)) else None,
            "status": response.status_code,
            "response": self.clean(body) if isinstance(body, (dict, list)) else None,
            "state": self.snapshot(),
        }
        location = response.get("Location") if hasattr(response, "get") else None
        if not location and isinstance(body, dict) and isinstance(body.get("location"), str):
            location = body["location"]
        if location:
            parts = urlsplit(location)
            step["redirect"] = {"to": f"{parts.scheme + '://' if parts.scheme else ''}{parts.netloc}{parts.path}",
                                "query": self.clean({k: v[0] for k, v in parse_qs(parts.query).items()})}
        self.tests.setdefault(test, []).append(step)

    def wrap(self, cls):
        for name in METHODS:
            if name not in vars(cls):
                continue
            original = getattr(cls, name)

            def recorded(client, path, data=None, *args, _original=original, _name=name, **kwargs):
                if self.busy:
                    return _original(client, path, data, *args, **kwargs)
                self.busy = True
                try:
                    response = _original(client, path, data, *args, **kwargs)
                finally:
                    self.busy = False
                self.record(client, _name.upper(), path, data, response)
                return response

            setattr(cls, name, recorded)


def main(argv=None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    sys.path.insert(0, os.getcwd())
    os.environ["DJANGO_SETTINGS_MODULE"] = args.settings

    import django

    django.setup()
    from django.apps import apps
    from django.conf import settings
    from django.test import Client
    from django.test.utils import get_runner

    models = [apps.get_model(label) for label in args.models.split(",") if label]
    extra = {s for s in args.secrets.split(",") if s}
    recorder = Recorder(models, SECRET_KEYS | extra)
    recorder.wrap(Client)
    try:
        from rest_framework.test import APIClient
    except ImportError:
        APIClient = None
    if APIClient is not None:
        recorder.wrap(APIClient)

    runner = get_runner(settings)(verbosity=1, interactive=False)
    failures = runner.run_tests(args.labels)
    trace = {
        "meta": {
            "settings": args.settings,
            "models": args.models.split(","),
            "labels": args.labels,
            "recorded_at": datetime.now().isoformat(timespec="seconds"),
            "failures": failures,
        },
        "tests": recorder.tests,
    }
    with open(args.out, "w") as fh:
        json.dump(trace, fh, indent=1, default=str)
    steps = sum(len(v) for v in recorder.tests.values())
    print(f"recorded {steps} steps across {len(recorder.tests)} tests -> {args.out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
