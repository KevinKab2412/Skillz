"""Each test is one operational principle of the trash concept (Jackson, ch. 4)."""


def create(client, name, size):
    return client.post("/items/", json={"name": name, "size": size}).json()["id"]


def test_deleted_item_can_be_restored(client):
    report = create(client, "report.pdf", 120)
    assert client.post(f"/items/{report}/delete/").status_code == 200
    assert client.get("/items/").json()["items"] == []
    assert client.post(f"/items/{report}/restore/").status_code == 200
    assert client.get("/items/").json()["items"] == ["report.pdf"]


def test_emptying_the_trash_removes_items_for_good(client):
    draft = create(client, "draft.txt", 10)
    create(client, "notes.txt", 20)
    client.post(f"/items/{draft}/delete/")
    assert client.post("/trash/empty/").json()["removed"] == 1
    assert client.post(f"/items/{draft}/restore/").status_code == 404
    assert client.get("/items/").json()["items"] == ["notes.txt"]


def test_deleting_does_not_free_space_until_the_trash_is_emptied(client):
    movie = create(client, "movie.mov", 4000)
    client.post(f"/items/{movie}/delete/")
    assert client.get("/usage/").json()["used"] == 4000
    client.post("/trash/empty/")
    assert client.get("/usage/").json()["used"] == 0
