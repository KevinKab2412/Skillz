// Each test is one operational principle of the trash concept (Jackson, ch. 4).
const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");

beforeEach(() => db.resetSchema());
afterAll(() => db.destroy());

async function create(name, size) {
  const res = await request(app).post("/items/").send({ name, size });
  return res.body.id;
}

describe("TrashTests", () => {
  test("deleted item can be restored", async () => {
    const report = await create("report.pdf", 120);
    expect((await request(app).post(`/items/${report}/delete/`)).status).toBe(200);
    expect((await request(app).get("/items/")).body.items).toEqual([]);
    expect((await request(app).post(`/items/${report}/restore/`)).status).toBe(200);
    expect((await request(app).get("/items/")).body.items).toEqual(["report.pdf"]);
  });

  test("emptying the trash removes items for good", async () => {
    const draft = await create("draft.txt", 10);
    await create("notes.txt", 20);
    await request(app).post(`/items/${draft}/delete/`);
    expect((await request(app).post("/trash/empty/")).body.removed).toBe(1);
    expect((await request(app).post(`/items/${draft}/restore/`)).status).toBe(404);
    expect((await request(app).get("/items/")).body.items).toEqual(["notes.txt"]);
  });

  test("deleting does not free space until the trash is emptied", async () => {
    const movie = await create("movie.mov", 4000);
    await request(app).post(`/items/${movie}/delete/`);
    expect((await request(app).get("/usage/")).body.used).toBe(4000);
    await request(app).post("/trash/empty/");
    expect((await request(app).get("/usage/")).body.used).toBe(0);
  });
});
