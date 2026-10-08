const knex = require("knex");

// One in-memory SQLite connection, so every query sees the same database.
const db = knex({
  client: "better-sqlite3",
  connection: { filename: ":memory:" },
  pool: { min: 1, max: 1 },
  useNullAsDefault: true,
});

async function resetSchema() {
  await db.schema.dropTableIfExists("items");
  await db.schema.createTable("items", (t) => {
    t.increments("id");
    t.string("name", 100).notNullable();
    t.integer("size").unsigned().notNullable().defaultTo(0);
    t.string("trashed_at").nullable();
  });
}

module.exports = db;
module.exports.resetSchema = resetSchema;
