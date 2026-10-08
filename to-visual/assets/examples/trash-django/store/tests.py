from django.test import TestCase


class TrashTests(TestCase):
    """Each test is one operational principle of the trash concept (Jackson, ch. 4)."""

    def create(self, name, size):
        return self.client.post("/items/", {"name": name, "size": size}, content_type="application/json").json()["id"]

    def test_deleted_item_can_be_restored(self):
        report = self.create("report.pdf", 120)
        self.assertEqual(self.client.post(f"/items/{report}/delete/").status_code, 200)
        self.assertEqual(self.client.get("/items/").json()["items"], [])
        self.assertEqual(self.client.post(f"/items/{report}/restore/").status_code, 200)
        self.assertEqual(self.client.get("/items/").json()["items"], ["report.pdf"])

    def test_emptying_the_trash_removes_items_for_good(self):
        draft = self.create("draft.txt", 10)
        self.create("notes.txt", 20)
        self.client.post(f"/items/{draft}/delete/")
        self.assertEqual(self.client.post("/trash/empty/").json()["removed"], 1)
        self.assertEqual(self.client.post(f"/items/{draft}/restore/").status_code, 404)
        self.assertEqual(self.client.get("/items/").json()["items"], ["notes.txt"])

    def test_deleting_does_not_free_space_until_the_trash_is_emptied(self):
        movie = self.create("movie.mov", 4000)
        self.client.post(f"/items/{movie}/delete/")
        self.assertEqual(self.client.get("/usage/").json()["used"], 4000)
        self.client.post("/trash/empty/")
        self.assertEqual(self.client.get("/usage/").json()["used"], 0)
