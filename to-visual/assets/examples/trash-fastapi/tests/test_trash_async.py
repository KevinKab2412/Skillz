"""The same three operational principles against the async app, through httpx.AsyncClient."""
import pytest

pytestmark = pytest.mark.anyio


async def create(client, name, size):
    return (await client.post("/items/", json={"name": name, "size": size})).json()["id"]


async def test_deleted_item_can_be_restored(aclient):
    report = await create(aclient, "report.pdf", 120)
    assert (await aclient.post(f"/items/{report}/delete/")).status_code == 200
    assert (await aclient.get("/items/")).json()["items"] == []
    assert (await aclient.post(f"/items/{report}/restore/")).status_code == 200
    assert (await aclient.get("/items/")).json()["items"] == ["report.pdf"]


async def test_emptying_the_trash_removes_items_for_good(aclient):
    draft = await create(aclient, "draft.txt", 10)
    await create(aclient, "notes.txt", 20)
    await aclient.post(f"/items/{draft}/delete/")
    assert (await aclient.post("/trash/empty/")).json()["removed"] == 1
    assert (await aclient.post(f"/items/{draft}/restore/")).status_code == 404
    assert (await aclient.get("/items/")).json()["items"] == ["notes.txt"]


async def test_deleting_does_not_free_space_until_the_trash_is_emptied(aclient):
    movie = await create(aclient, "movie.mov", 4000)
    await aclient.post(f"/items/{movie}/delete/")
    assert (await aclient.get("/usage/")).json()["used"] == 4000
    await aclient.post("/trash/empty/")
    assert (await aclient.get("/usage/")).json()["used"] == 0
