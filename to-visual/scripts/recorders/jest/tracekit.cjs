// The trace contract in JavaScript (see ../tracekit.py): shortening, cleaning, relative
// datetimes, redirects, and a snapshot of the named tables through Knex or Prisma.
const path = require("path");

const SECRET_KEYS = new Set(require(path.join(__dirname, "..", "contract.json")).secret_keys);
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function secretKeys(extra = "") {
  return new Set([...SECRET_KEYS, ...extra.split(",").filter(Boolean)]);
}

function short(value) {
  const s = String(value);
  return s.length <= 8 ? s : s.slice(0, 6) + "…";
}

function clean(obj, secrets) {
  if (Array.isArray(obj)) return obj.map((v) => clean(v, secrets));
  if (obj instanceof Date) return obj.toISOString();
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = secrets.has(k) && v !== null && v !== undefined && v !== "" ? short(v) : clean(v, secrets);
    }
    return out;
  }
  if (obj === undefined) return null;
  return ["string", "number", "boolean"].includes(typeof obj) || obj === null ? obj : String(obj);
}

function relative(value, now) {
  const seconds = (value.getTime() - now.getTime()) / 1000;
  return (seconds < 0 ? "-" : "+") + Math.abs(seconds).toFixed(0) + "s";
}

function asDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !DATETIME.test(value)) return null;
  const iso = value.replace(" ", "T");
  const date = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : iso + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

function cell(name, value, now, secrets) {
  if (value === null || value === undefined) return null;
  if (secrets.has(name)) return short(value);
  const date = asDate(value);
  if (date) return relative(date, now);
  if (typeof value === "bigint") return String(value);
  if (Buffer.isBuffer(value)) return short(value.toString("hex"));
  if (value && typeof value.toNumber === "function") return value.toNumber(); // Prisma Decimal
  return ["string", "number", "boolean"].includes(typeof value) || typeof value === "object" ? value : String(value);
}

function redirect(location, secrets) {
  const url = new URL(location, "http://relative.invalid");
  const to = location.startsWith("/") ? url.pathname : `${url.protocol}//${url.host}${url.pathname}`;
  return { to, query: clean(Object.fromEntries(url.searchParams), secrets) };
}

function scheme(authorization) {
  return authorization ? String(authorization).split(" ", 1)[0] : "none";
}

// "Item=items,User=users" -> [{label: "Item", source: "items"}, ...]
function parseModels(spec) {
  return spec.split(",").filter(Boolean).map((part) => {
    const [label, source] = part.split("=");
    return { label: label.trim(), source: (source || label).trim() };
  });
}

function isKnex(h) {
  return typeof h === "function" && h.client && typeof h.select === "function";
}

function isPrisma(h) {
  return Boolean(h) && typeof h.$queryRawUnsafe === "function";
}

// The module may export the handle itself, or hold it under default/db/knex/prisma.
function findHandle(mod) {
  for (const h of [mod, mod && mod.default, mod && mod.db, mod && mod.knex, mod && mod.prisma]) {
    if (isKnex(h) || isPrisma(h)) return h;
  }
  throw new Error("to-visual: TOVISUAL_DB must export a Knex instance or a Prisma client (as module.exports, default, db, knex or prisma)");
}

const knexOrder = new Map();

async function knexRows(db, table) {
  if (!knexOrder.has(table)) {
    const columns = Object.keys(await db(table).columnInfo());
    knexOrder.set(table, columns.includes("id") ? "id" : columns[0]);
  }
  return db(table).select().orderBy(knexOrder.get(table));
}

async function prismaRows(prisma, model) {
  const delegate = prisma[model.charAt(0).toLowerCase() + model.slice(1)];
  if (!delegate || typeof delegate.findMany !== "function") throw new Error(`to-visual: Prisma has no model ${model}`);
  const known = ((prisma._runtimeDataModel || {}).models || {})[model.charAt(0).toUpperCase() + model.slice(1)];
  const fields = known ? known.fields || [] : null;
  const id = fields && fields.find((f) => f.isId);
  const key = id ? id.name : !fields || fields.some((f) => f.name === "id") ? "id" : null;
  if (!key) return delegate.findMany();
  return delegate.findMany({ orderBy: { [key]: "asc" } }).catch((error) => (known ? Promise.reject(error) : delegate.findMany()));
}

async function snapshot(handle, models, secrets, now = new Date()) {
  const state = {};
  for (const { label, source } of models) {
    const rows = isPrisma(handle) ? await prismaRows(handle, source) : await knexRows(handle, source);
    state[label] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cell(k, v, now, secrets)])));
  }
  return state;
}

module.exports = { secretKeys, short, clean, cell, relative, redirect, scheme, parseModels, findHandle, snapshot };
