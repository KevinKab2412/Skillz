#!/usr/bin/env python3
"""
Always-warm skill-router daemon. Builds the router once (~0.7s), then serves
shortlist requests over a Unix socket in ~1ms each. No model reload per query.

  start:  ./.venv/bin/python src/routerd.py
  query:  ./.venv/bin/python src/ask.py "open a draft PR for this branch"

Line protocol (one JSON object per line, newline-terminated):
  ->  {"q": "text", "k": 10}      or  {"cmd": "ping"}
  <-  {"shortlist": [{"skill","score"}...], "ms": 0.9, "n_train": 196}
"""
import warnings; warnings.filterwarnings("ignore")
import json, os, socket, socketserver, sys, time
from router_core import Router

HERE = os.path.dirname(os.path.abspath(__file__))
SOCK = os.path.join(HERE, "..", "routerd.sock")

router = None  # built in main, shared across handler threads (read-only)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        for raw in self.rfile:
            try:
                req = json.loads(raw.decode() or "{}")
            except Exception as e:
                self.wfile.write(json.dumps({"error": f"bad json: {e}"}).encode() + b"\n")
                continue
            if req.get("cmd") == "ping":
                self.wfile.write(json.dumps({"ok": True, "n_train": router.n_train,
                                             "skills": router.N}).encode() + b"\n")
                continue
            t = time.time()
            out = router.rank(req.get("q", ""), int(req.get("k", 10)))
            self.wfile.write(json.dumps({"shortlist": out, "ms": round((time.time()-t)*1000, 2),
                                         "n_train": router.n_train}).encode() + b"\n")


class Server(socketserver.ThreadingUnixStreamServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    global router
    if os.path.exists(SOCK):
        os.unlink(SOCK)
    t = time.time()
    router = Router()
    print(f"[routerd] built in {time.time()-t:.2f}s: {router.n_train} history turns, "
          f"{router.N} skills. listening on {SOCK}", flush=True)
    srv = Server(SOCK, Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        if os.path.exists(SOCK):
            os.unlink(SOCK)
        print("[routerd] stopped", flush=True)


if __name__ == "__main__":
    main()
