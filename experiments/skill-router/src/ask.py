#!/usr/bin/env python3
"""
Thin client for the warm skill-router daemon.

  ./.venv/bin/python src/ask.py "can you review this branch before I merge"
  ./.venv/bin/python src/ask.py --k 5 "push these to main"
  ./.venv/bin/python src/ask.py --json "open a PR"        # machine-readable

Falls back to an in-process build (slow, ~0.7s) if the daemon isn't running,
so it always works; start routerd.py to get the ~1ms warm path.
"""
import json, os, socket, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOCK = os.path.join(HERE, "..", "routerd.sock")


def query_daemon(q, k):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(SOCK)
    s.sendall((json.dumps({"q": q, "k": k}) + "\n").encode())
    buf = b""
    while not buf.endswith(b"\n"):
        chunk = s.recv(4096)
        if not chunk:
            break
        buf += chunk
    s.close()
    return json.loads(buf.decode())


def main():
    args = sys.argv[1:]
    as_json = "--json" in args
    if as_json:
        args.remove("--json")
    k = 10
    if "--k" in args:
        i = args.index("--k"); k = int(args[i+1]); del args[i:i+2]
    q = " ".join(args)
    if not q:
        print("usage: ask.py [--k N] [--json] \"your message\""); return

    try:
        res = query_daemon(q, k)
        src = "daemon"
    except (FileNotFoundError, ConnectionRefusedError, socket.error):
        import warnings; warnings.filterwarnings("ignore")
        from router_core import Router
        r = Router()
        res = {"shortlist": r.rank(q, k), "ms": None, "n_train": r.n_train}
        src = "in-process (daemon not running)"

    if as_json:
        print(json.dumps(res)); return
    ms = f"{res['ms']} ms" if res.get("ms") is not None else "cold"
    print(f"shortlist for: {q!r}   [{src}, {ms}, {res['n_train']} history turns]\n")
    for i, o in enumerate(res["shortlist"], 1):
        bar = "█" * max(1, round(o["score"] * 24))
        print(f"  {i:2d}. {o['skill']:32s} {o['score']:.3f}  {bar}")


if __name__ == "__main__":
    main()
