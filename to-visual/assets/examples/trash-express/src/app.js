// A file is an item. Deleting moves it to the trash (trashed_at is set); emptying removes it for good.
const express = require("express");
const db = require("./db");

const app = express();
app.use(express.json());

app.post("/items/", async (req, res) => {
  const { name, size = 0 } = req.body;
  const [id] = await db("items").insert({ name, size });
  res.status(201).json({ id, name });
});

app.get("/items/", async (req, res) => {
  const rows = await db("items").whereNull("trashed_at").orderBy("id").select("name");
  res.json({ items: rows.map((r) => r.name) });
});

app.post("/items/:id/delete/", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db("items").where({ id }).whereNull("trashed_at").update({ trashed_at: new Date().toISOString() });
  res.status(updated ? 200 : 404).json(updated ? { trashed: id } : { error: "not_found" });
});

app.post("/items/:id/restore/", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db("items").where({ id }).whereNotNull("trashed_at").update({ trashed_at: null });
  res.status(updated ? 200 : 404).json(updated ? { restored: id } : { error: "not_in_trash" });
});

app.post("/trash/empty/", async (req, res) => {
  const removed = await db("items").whereNotNull("trashed_at").del();
  res.json({ removed });
});

app.get("/usage/", async (req, res) => {
  const { total } = await db("items").sum({ total: "size" }).first();
  res.json({ used: total || 0 });
});

module.exports = app;
