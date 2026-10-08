import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from to_visual_reference import RECORDERS, assert_matches_reference, copy_example

RECORD = RECORDERS / "jest/record.cjs"
KIT = RECORDERS / "jest/tracekit.cjs"

OWN_SETUP = 'require("fs").writeFileSync(require("path").join(__dirname, "..", "own-setup-ran"), "yes");\n'
EXTRAS = """const express = require("express");
const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");

beforeEach(() => db.resetSchema());
afterAll(() => db.destroy());

const away = express();
away.get("/go/", (req, res) => res.redirect(302, "/items/?from=go&token=abcdefghijklmn"));

test("agents, auth, query and redirect", async () => {
  const alice = request.agent(app);
  const bob = request.agent(app);
  await alice.post("/items/").set("Authorization", "Bearer abcdefghijkl").send({ name: "x", size: 1, token: "abcdefghijkl" });
  await bob.get("/items/").query({ page: 2 });
  await alice.get("/items/");
  await request(app).get("/usage/");
  await request(away).get("/go/");
});
"""
PRISMA_STUB = """const kit = require(process.argv[1]);
const calls = [];
const prisma = {
  $queryRawUnsafe() {},
  _runtimeDataModel: { models: { Item: { fields: [{ name: "uid", isId: true }, { name: "name" }] } } },
  item: { findMany: async (args) => { calls.push(args); return [
    { uid: 2, name: "b", createdAt: new Date(Date.now() - 3600e3), password: "hunter2hunter2", price: { toNumber: () => 1.5 } },
  ]; } },
};
kit.snapshot(kit.findHandle({ prisma }), kit.parseModels("Item=Item"), kit.secretKeys(""))
  .then((state) => console.log(JSON.stringify({ state, calls })));
"""


def npm_available() -> bool:
    return bool(shutil.which("node") and shutil.which("npm"))


@unittest.skipUnless(npm_available(), "needs node and npm")
class ExpressRecorderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.work = copy_example("trash-express", cls.tmp.name)
        install = subprocess.run(["npm", "install", "--prefer-offline", "--no-audit", "--no-fund"],
                                 cwd=cls.work, capture_output=True, text=True, check=False)
        if install.returncode != 0:
            cls.tmp.cleanup()
            raise unittest.SkipTest(f"npm install failed (offline?): {install.stderr[-500:]}")
        package = json.loads((cls.work / "package.json").read_text())
        package["jest"]["setupFilesAfterEnv"] = ["<rootDir>/tests/own-setup.js"]
        (cls.work / "package.json").write_text(json.dumps(package))
        (cls.work / "tests/own-setup.js").write_text(OWN_SETUP)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def record(self, *jest_args):
        out = Path(self.tmp.name) / "trace.json"
        result = subprocess.run(["node", str(RECORD), "--db", "src/db.js", "--models", "Item=items", "--out", str(out),
                                 "--", *jest_args], cwd=self.work, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout[-2000:] + result.stderr[-2000:])
        return json.loads(out.read_text())

    def test_records_the_trash_port_like_the_django_reference(self):
        trace = self.record("tests/trash.test.js")
        self.assertEqual(trace["meta"]["stack"], "express")
        self.assertEqual(list(trace["tests"])[0], "TrashTests › deleted item can be restored")
        self.assertTrue((self.work / "own-setup-ran").exists(), "the project's own setupFilesAfterEnv was dropped")
        assert_matches_reference(self, trace)

    def test_numbers_agents_and_reads_auth_query_and_redirects(self):
        (self.work / "tests/extras.test.js").write_text(EXTRAS)
        try:
            steps = self.record("tests/extras.test.js")["tests"]["extras › agents, auth, query and redirect"]
        finally:
            (self.work / "tests/extras.test.js").unlink()
        self.assertEqual([s["caller"] for s in steps], [{"client": 1, "auth": "Bearer"}, {"client": 2, "auth": "none"},
                                                        {"client": 1, "auth": "none"}, {"client": 3, "auth": "none"},
                                                        {"client": 3, "auth": "none"}])
        self.assertEqual(steps[0]["params"], {"name": "x", "size": 1, "token": "abcdef…"})
        self.assertEqual(steps[1]["params"], {"page": 2})
        self.assertEqual(steps[4]["status"], 302)
        self.assertEqual(steps[4]["redirect"], {"to": "/items/", "query": {"from": "go", "token": "abcdef…"}})

    def test_prisma_snapshot_orders_by_its_id_and_cleans_cells(self):
        result = subprocess.run(["node", "-e", PRISMA_STUB, str(KIT)], capture_output=True, text=True, check=True)
        out = json.loads(result.stdout)
        self.assertEqual(out["calls"], [{"orderBy": {"uid": "asc"}}])
        self.assertEqual(out["state"]["Item"], [{"uid": 2, "name": "b", "createdAt": "-3600s", "password": "hunter…", "price": 1.5}])


if __name__ == "__main__":
    unittest.main()
