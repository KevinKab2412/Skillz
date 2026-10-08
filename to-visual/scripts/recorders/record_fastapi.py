"""Record a concept trace from a FastAPI (or any Starlette) test run: a pytest plugin.

Each request a test sends through Starlette's ``TestClient``, or through an ``httpx.AsyncClient``
on an ``ASGITransport``, becomes one step: who called, the action, the params, the status, the
response, and a snapshot of the named models' rows right after it. Rows are read through the
engine the app's SQLAlchemy session used last (SQLModel too), and through its connection while
that connection is still mid-transaction, so rollback-per-test fixtures show their rows. A redirect
TestClient followed becomes one step per hop. Steps are grouped by test. The trace shape is in
``tracekit.py``.

Run it with the target project's own environment, on an export of the change (``git archive``),
never on a reviewer's checkout:

    PYTHONPATH=<to-visual>/scripts/recorders uv run --frozen pytest -p record_fastapi \\
        --tovisual-out trace.json --tovisual-models app.models:Item,app.models:User <test paths>

Without ``--tovisual-out`` the plugin does nothing.
"""
from __future__ import annotations

import contextvars
import os
import sys
import warnings
from datetime import datetime, timezone
from importlib import import_module

import pytest

import tracekit

_busy = contextvars.ContextVar("tovisual_busy", default=False)


def pytest_addoption(parser):
    group = parser.getgroup("tovisual", "to-visual concept trace")
    group.addoption("--tovisual-out", help="trace JSON to write; without it the plugin does nothing")
    group.addoption("--tovisual-models", default="", help="comma-separated pkg.module:Model whose rows are the concept's state")
    group.addoption("--tovisual-secrets", default="", help="extra comma-separated field/param names to shorten")


def pytest_configure(config):
    out = config.getoption("--tovisual-out")
    if not out:
        return
    labels = [label for label in config.getoption("--tovisual-models").split(",") if label]
    if not labels:
        raise pytest.UsageError("--tovisual-models is required with --tovisual-out")
    if getattr(config, "workerinput", None) is not None or getattr(config.option, "numprocesses", None):
        raise pytest.UsageError("record_fastapi records in one process: run with -p no:xdist")
    sys.path.insert(0, os.getcwd())
    config.pluginmanager.register(Recorder(config, out, labels), "tovisual-recorder")


class Recorder:
    def __init__(self, config, out, labels):
        self.config, self.out, self.labels = config, out, labels
        self.secrets = tracekit.secret_keys(config.getoption("--tovisual-secrets"))
        self.models = []
        self.tests: dict[str, list] = {}
        self.clients = tracekit.Clients()
        self.test = "unattributed"
        self.engine = self.connection = None
        self.warnings: list[str] = []
        self.restore = []
        self.listen()
        self.wrap()

    # -- pytest hooks ------------------------------------------------------------------------
    def pytest_collection_finish(self, session):
        try:
            self.models = [self.resolve(label) for label in self.labels]
        except (ImportError, AttributeError, ValueError) as exc:
            pytest.exit(f"record_fastapi: can't load --tovisual-models: {exc}", returncode=4)

    @pytest.hookimpl(tryfirst=True)
    def pytest_runtest_setup(self, item):
        self.test = f"{item.cls.__name__}.{item.name}" if item.cls else f"{item.path.stem}.{item.name}"
        self.engine = self.connection = None

    def pytest_runtest_logfinish(self, nodeid, location):
        self.test = "unattributed"

    def pytest_sessionfinish(self, session, exitstatus):
        tracekit.write_trace(self.out, "fastapi", self.labels, list(self.config.args), session.testsfailed, self.tests,
                             warnings=self.warnings)

    def pytest_unconfigure(self, config):
        for undo in self.restore:
            undo()

    # -- state ---------------------------------------------------------------------------------
    @staticmethod
    def resolve(label):
        module, sep, name = label.partition(":")
        if not sep:
            module, _, name = label.rpartition(".")
        obj = getattr(import_module(module), name)
        table = getattr(obj, "__table__", obj)
        return getattr(obj, "__name__", table.name), table

    def listen(self):
        from sqlalchemy import event
        from sqlalchemy.orm import Session

        def saw(session, transaction, connection):
            self.engine, self.connection = connection.engine, connection

        event.listen(Session, "after_begin", saw)
        self.restore.append(lambda: event.remove(Session, "after_begin", saw))

    def rows(self):
        conn = self.connection
        if conn is not None and not conn.closed and not conn.invalidated and conn.in_transaction():
            return self.read(conn)
        with self.engine.connect() as fresh:
            return self.read(fresh)

    def read(self, conn):
        from sqlalchemy import select

        now = datetime.now(timezone.utc)
        return {
            name: [{c.name: tracekit.cell(row[c], now, self.secrets, c.name, c.key) for c in table.columns}
                   for row in conn.execute(select(table).order_by(*table.primary_key.columns)).mappings()]
            for name, table in self.models
        }

    def snapshot(self, client):
        if self.engine is None:
            return {}
        try:
            if not self.engine.dialect.is_async:
                return self.rows()
            portal = getattr(client, "portal", None)
            if portal is None:
                self.warn("the app's engine is async but the test uses TestClient outside `with TestClient(app) as client:`, "
                          "so there's no event loop to read it in. Enter the client with `with`, or test with "
                          "httpx.AsyncClient(transport=ASGITransport(app)). State left empty.")
                return {}
            from sqlalchemy.util import greenlet_spawn

            return portal.call(greenlet_spawn, self.rows)
        except Exception as exc:  # a snapshot must never fail the test it watches
            self.warn(f"couldn't read the models: {exc!r}. State left empty.")
            return {}

    async def snapshot_async(self):
        if self.engine is None:
            return {}
        try:
            if not self.engine.dialect.is_async:
                return self.rows()
            from sqlalchemy.util import greenlet_spawn

            return await greenlet_spawn(self.rows)
        except Exception as exc:  # a snapshot must never fail the test it watches
            self.warn(f"couldn't read the models: {exc!r}. State left empty.")
            return {}

    def warn(self, message):
        if message not in self.warnings:
            self.warnings.append(message)
            warnings.warn(f"record_fastapi: {message}", RuntimeWarning, stacklevel=2)

    # -- requests ------------------------------------------------------------------------------
    def params(self, kwargs, request):
        for key in ("json", "data", "content"):
            value = kwargs.get(key)
            if value is not None:
                break
        else:
            value = dict(request.url.params) or None
        if isinstance(value, (bytes, str)):
            value = tracekit.parse_json(value)
        return tracekit.clean(value, self.secrets) if isinstance(value, (dict, list)) else None

    def record(self, client, kwargs, response, state):
        hops = [*response.history, response]
        for n, hop in enumerate(hops):
            request = hop.request
            body = tracekit.parse_json(hop.content)
            step = {
                "caller": {"client": self.clients.number(self.test, client),
                           "auth": tracekit.scheme(request.headers.get("authorization"))},
                "method": request.method,
                "path": request.url.path,
                "params": self.params(kwargs, request) if n == 0 else (tracekit.clean(dict(request.url.params), self.secrets) or None),
                "status": hop.status_code,
                "response": tracekit.clean(body, self.secrets) if isinstance(body, (dict, list)) else None,
                "state": state,
            }
            location = hop.headers.get("location")
            if not location and isinstance(body, dict) and isinstance(body.get("location"), str):
                location = body["location"]
            if location:
                step["redirect"] = tracekit.redirect(location, self.secrets)
            self.tests.setdefault(self.test, []).append(step)

    def wrap(self):
        recorder = self
        try:
            from starlette.testclient import TestClient
        except ImportError:
            TestClient = None
        if TestClient is not None:
            original = TestClient.request

            def request(client, method, url, *args, **kwargs):
                if _busy.get():
                    return original(client, method, url, *args, **kwargs)
                token = _busy.set(True)
                try:
                    response = original(client, method, url, *args, **kwargs)
                finally:
                    _busy.reset(token)
                recorder.record(client, kwargs, response, recorder.snapshot(client))
                return response

            TestClient.request = request
            self.restore.append(lambda: setattr(TestClient, "request", original))

        try:
            import httpx
        except ImportError:
            return
        original_async = httpx.AsyncClient.request

        async def arequest(client, method, url, *args, **kwargs):
            if _busy.get() or not isinstance(getattr(client, "_transport", None), httpx.ASGITransport):
                return await original_async(client, method, url, *args, **kwargs)
            token = _busy.set(True)
            try:
                response = await original_async(client, method, url, *args, **kwargs)
            finally:
                _busy.reset(token)
            recorder.record(client, kwargs, response, await recorder.snapshot_async())
            return response

        httpx.AsyncClient.request = arequest
        self.restore.append(lambda: setattr(httpx.AsyncClient, "request", original_async))
