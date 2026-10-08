// Loaded by record.cjs through Jest's setupFilesAfterEnv. Wraps supertest's Test#end so each
// request a test makes becomes one step, written to TOVISUAL_JSONL after the named tables are
// snapshotted. The test's own callback runs only after the snapshot, so it can't move on early.
const fs = require("fs");
const http = require("http");
const path = require("path");
const kit = require("./tracekit.cjs");

const cwd = process.cwd();
const fromProject = (name) => require(require.resolve(name, { paths: [cwd] }));
const supertest = fromProject("supertest");
const models = kit.parseModels(process.env.TOVISUAL_MODELS || "");
const secrets = kit.secretKeys(process.env.TOVISUAL_SECRETS || "");
const PLAIN = "request(app)";
const clients = new Map(); // test id -> Map(client -> number)

function currentTest() {
  const sym = Object.getOwnPropertySymbols(globalThis).find((s) => s.description === "JEST_STATE_SYMBOL");
  const running = sym && globalThis[sym] && globalThis[sym].currentlyRunningTest;
  if (running) {
    const names = [];
    for (let block = running; block && block.parent; block = block.parent) names.unshift(block.name);
    if (names.length === 1) names.unshift(path.basename(expect.getState().testPath || "").replace(/(\.(test|spec))?\.[cm]?[jt]sx?$/, ""));
    return names.join(" › ");
  }
  return expect.getState().currentTestName || "unattributed";
}

function clientNumber(test, client) {
  if (!clients.has(test)) clients.set(test, new Map());
  const numbers = clients.get(test);
  if (!numbers.has(client)) numbers.set(client, numbers.size + 1);
  return numbers.get(client);
}

function body(res) {
  if (/json/.test(res.type || "")) return res.body;
  try {
    const parsed = JSON.parse(res.text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function params(test) {
  const data = typeof test._data === "string" ? (() => { try { return JSON.parse(test._data); } catch (_) { return null; } })() : test._data;
  if (data && typeof data === "object") return data;
  const query = Object.assign({}, test.qs);
  for (const part of test._query || []) Object.assign(query, Object.fromEntries(new URLSearchParams(part)));
  return Object.keys(query).length ? query : null;
}

async function record(test, sent, res) {
  const db = kit.findHandle(require(path.resolve(cwd, process.env.TOVISUAL_DB)));
  const state = await kit.snapshot(db, models, secrets);
  const id = currentTest();
  const url = new URL(test.url);
  const response = body(res);
  const step = {
    caller: { client: clientNumber(id, test.__tovisualClient || PLAIN), auth: kit.scheme((test._header || {}).authorization) },
    method: test.method,
    path: url.pathname,
    params: sent || (url.search ? Object.fromEntries(url.searchParams) : null),
    status: res.status,
    response: response && typeof response === "object" ? kit.clean(response, secrets) : null,
    state,
  };
  if (step.params) step.params = kit.clean(step.params, secrets);
  const location = (res.headers || {}).location || (response && typeof response.location === "string" ? response.location : null);
  if (location) step.redirect = kit.redirect(location, secrets);
  fs.appendFileSync(process.env.TOVISUAL_JSONL, JSON.stringify({ test: id, step }) + "\n");
}

const end = supertest.Test.prototype.end;
if (!end.__tovisual) {
  supertest.Test.prototype.end = function (fn) {
    const test = this;
    const given = params(test);
    const sent = given && JSON.parse(JSON.stringify(given));
    return end.call(this, function (err, res) {
      const done = () => (fn ? fn.call(this, err, res) : undefined);
      if (!res) return done();
      record(test, sent, res).then(done, (error) => {
        process.stderr.write(`to-visual: could not record ${test.method} ${test.url}: ${error.stack || error}\n`);
        done();
      });
    });
  };
  supertest.Test.prototype.end.__tovisual = true;

  // request.agent(app) keeps cookies between requests: give each agent its own client number.
  const agent = supertest.agent.prototype;
  for (const verb of [...http.METHODS.map((m) => m.toLowerCase()), "del"]) {
    if (verb === "query" || !Object.prototype.hasOwnProperty.call(agent, verb)) continue;
    const make = agent[verb];
    agent[verb] = function (...args) {
      const req = make.apply(this, args);
      req.__tovisualClient = this;
      return req;
    };
  }
}
