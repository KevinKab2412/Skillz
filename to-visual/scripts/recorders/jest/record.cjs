#!/usr/bin/env node
/*
Record a concept trace from an Express app's Jest run, from outside the repo under review.

Each request a test makes through supertest (request(app) or request.agent(app)) becomes one
step: who called, the action, the params, the status, the response, and a snapshot of the
named tables right after it, read through the app's own Knex instance or Prisma client. Steps
are grouped by test ("Describe › test name"). The trace shape is in ../tracekit.py.

Run it from the project root (where node_modules is), on an export of the change (git archive),
never on a reviewer's checkout, after installing its dependencies (npm ci):

    node <to-visual>/scripts/recorders/jest/record.cjs \
        --db src/db.js --models Item=items,User=users --out trace.json -- <jest args>

--db      module exporting the Knex instance or Prisma client (as module.exports, default, db, knex or prisma)
--models  Label=table for Knex, Label=Model for Prisma; the label is the state key in the trace
--secrets extra comma-separated field/param names to shorten

Jest runs in band with this directory's setup.cjs added to the project's own setupFilesAfterEnv.
*/
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function parseArgs(argv) {
  const split = argv.indexOf("--");
  const own = split === -1 ? argv : argv.slice(0, split);
  const args = { secrets: "", jest: split === -1 ? [] : argv.slice(split + 1) };
  for (let i = 0; i < own.length; i += 1) {
    const [key, inline] = own[i].replace(/^--/, "").split(/=(.*)/s);
    args[key] = inline !== undefined ? inline : own[++i];
  }
  for (const key of ["db", "models", "out"]) {
    if (!args[key]) {
      process.stderr.write(`record.cjs: --${key} is required\n\n${fs.readFileSync(__filename, "utf8").split("*/")[0].slice(3)}`);
      process.exit(2);
    }
  }
  return args;
}

function jestBin(cwd) {
  try {
    return require.resolve("jest/bin/jest", { paths: [cwd] });
  } catch (_) {
    process.stderr.write("record.cjs: no jest in this project's node_modules; install its dependencies first\n");
    process.exit(2);
  }
}

// Jest replaces, not extends, setupFilesAfterEnv given on the command line, so pass the
// project's own (resolved through --showConfig) along with ours.
function projectSetupFiles(bin, jestArgs, cwd) {
  const shown = spawnSync(process.execPath, [bin, "--showConfig", ...jestArgs], { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  if (shown.status !== 0) {
    process.stderr.write(shown.stderr);
    process.exit(2);
  }
  const lists = JSON.parse(shown.stdout).configs.map((c) => JSON.stringify(c.setupFilesAfterEnv || []));
  if (new Set(lists).size > 1) {
    process.stderr.write("record.cjs: the Jest projects have different setupFilesAfterEnv; pick one with --selectProjects\n");
    process.exit(2);
  }
  return JSON.parse(lists[0] || "[]");
}

function localStamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const bin = jestBin(cwd);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tovisual-jest-"));
  const jsonl = path.join(tmp, "steps.jsonl");
  const results = path.join(tmp, "results.json");
  fs.writeFileSync(jsonl, "");

  const setupFiles = [...projectSetupFiles(bin, args.jest, cwd), path.join(__dirname, "setup.cjs")];
  const run = spawnSync(process.execPath, [
    bin, ...setupFiles.map((f) => `--setupFilesAfterEnv=${f}`),
    "--runInBand", "--json", `--outputFile=${results}`, ...args.jest,
  ], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, TOVISUAL_JSONL: jsonl, TOVISUAL_DB: args.db, TOVISUAL_MODELS: args.models, TOVISUAL_SECRETS: args.secrets },
  });

  const tests = {};
  for (const line of fs.readFileSync(jsonl, "utf8").split("\n").filter(Boolean)) {
    const { test, step } = JSON.parse(line);
    (tests[test] = tests[test] || []).push(step);
  }
  let failures = run.status === 0 ? 0 : 1;
  if (fs.existsSync(results)) {
    const summary = JSON.parse(fs.readFileSync(results, "utf8"));
    failures = summary.numFailedTests + summary.numRuntimeErrorTestSuites || (run.status === 0 ? 0 : 1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const trace = {
    meta: {
      stack: "express", models: args.models.split(",").filter(Boolean), labels: args.jest,
      recorded_at: localStamp(new Date()), failures, db: args.db,
    },
    tests,
  };
  fs.writeFileSync(args.out, JSON.stringify(trace, null, 1));
  const steps = Object.values(tests).reduce((n, s) => n + s.length, 0);
  console.log(`recorded ${steps} steps across ${Object.keys(tests).length} tests -> ${args.out}`);
  process.exit(failures ? 1 : 0);
}

main();
