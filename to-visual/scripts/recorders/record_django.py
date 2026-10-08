#!/usr/bin/env python3
"""Record a concept trace from a Django test run, from outside the repo under review.

Each request a test makes through Django's test ``Client`` (or DRF's ``APIClient``)
becomes one step: who called, the action, the params, the status, the response, and a
snapshot of the named models' rows right after it. Steps are grouped by test, so a test
name is the step's provenance. The trace shape is in ``tracekit.py``.

Run it with the target project's own environment, from the directory that holds its
``manage.py``, on an export of the change (``git archive``), never on a reviewer's checkout:

    uv run --frozen python <to-visual>/scripts/recorders/record_django.py \\
        --settings myproj.settings --models app.Model,other.Model --out trace.json -- <test labels>
"""
from __future__ import annotations

import argparse
import os
import sys
import unittest

import tracekit

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


class Recorder:
    def __init__(self, models, secrets):
        self.models = models
        self.secrets = secrets
        self.tests: dict[str, list] = {}
        self.clients = tracekit.Clients()
        self.busy = False

    def snapshot(self):
        from django.utils import timezone

        now = timezone.now()
        state = {}
        for model in self.models:
            fields = model._meta.concrete_fields
            state[model.__name__] = [
                {f.attname: tracekit.cell(getattr(obj, f.attname), now, self.secrets, f.name, f.attname) for f in fields}
                for obj in model._base_manager.order_by("pk")
            ]
        return state

    @staticmethod
    def current_test():
        frame = sys._getframe(1)
        while frame:
            owner = frame.f_locals.get("self")
            if isinstance(owner, unittest.TestCase):
                return f"{type(owner).__name__}.{owner._testMethodName}"
            frame = frame.f_back
        return "unattributed"

    def record(self, client, method, path, data, response):
        payload = tracekit.parse_json(data) if isinstance(data, (bytes, str)) else data
        body = tracekit.parse_json(response.content)
        test = self.current_test()
        auth = (getattr(client, "_credentials", None) or {}).get("HTTP_AUTHORIZATION") or (
            getattr(client, "defaults", None) or {}).get("HTTP_AUTHORIZATION", "")
        step = {
            "caller": {"client": self.clients.number(test, client), "auth": tracekit.scheme(auth)},
            "method": method,
            "path": path.split("?", 1)[0],
            "params": tracekit.clean(payload, self.secrets) if isinstance(payload, (dict, list)) else None,
            "status": response.status_code,
            "response": tracekit.clean(body, self.secrets) if isinstance(body, (dict, list)) else None,
            "state": self.snapshot(),
        }
        location = response.get("Location") if hasattr(response, "get") else None
        if not location and isinstance(body, dict) and isinstance(body.get("location"), str):
            location = body["location"]
        if location:
            step["redirect"] = tracekit.redirect(location, self.secrets)
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

    labels = [label for label in args.models.split(",") if label]
    recorder = Recorder([apps.get_model(label) for label in labels], tracekit.secret_keys(args.secrets))
    recorder.wrap(Client)
    try:
        from rest_framework.test import APIClient
    except ImportError:
        APIClient = None
    if APIClient is not None:
        recorder.wrap(APIClient)

    runner = get_runner(settings)(verbosity=1, interactive=False)
    failures = runner.run_tests(args.labels)
    tracekit.write_trace(args.out, "django", labels, args.labels, failures, recorder.tests, settings=args.settings)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
