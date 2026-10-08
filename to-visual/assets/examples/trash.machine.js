// Play rules for the trash concept. MACHINE is the container element (set by assemble.py).
// Each rule mirrors examples/trash-app/store/views.py and cites the test that proves it.
V.machine(MACHINE, {
  groups: [
    { title: "You", controls: [
      { select: "file", options: [["report.pdf:120", "file: report.pdf (120)"], ["movie.mov:4000", "file: movie.mov (4000)"], ["notes.txt:20", "file: notes.txt (20)"]] },
      { action: "create", label: "Create" },
      { action: "delete", label: "Delete newest file" },
      { action: "restore", label: "Restore newest trashed" },
      { action: "empty", label: "Empty the trash" },
      { action: "usage", label: "How much space?" },
    ] },
  ],
  tables: [{ id: "items", title: "Items", cols: ["id", "name", "size", "where"], widths: ["50px", "150px", "80px", "1fr"] }],
  init: function () { return { seq: 0, items: [] }; },
  rows: function (s) {
    return { items: s.items.map(function (i) {
      return { key: i.id, cells: [i.id, i.name, i.size, i.trashed ? "in the trash" : "your files"], dead: i.trashed };
    }) };
  },
  actions: {
    create: function (s, ui, log) {
      var parts = ui.get("file").split(":");
      s.seq += 1;
      s.items.push({ id: s.seq, name: parts[0], size: +parts[1], trashed: false });
      log(true, "create " + parts[0] + " → 201 · id " + s.seq, "");
    },
    delete: function (s, ui, log) {
      var live = s.items.filter(function (i) { return !i.trashed; }).slice(-1)[0];
      if (!live) return log(false, "delete → 404", "Nothing in your files.");
      live.trashed = true;
      log(true, "delete " + live.name + " → 200", "Marked as trashed; the row stays (test_deleted_item_can_be_restored).");
    },
    restore: function (s, ui, log) {
      var t = s.items.filter(function (i) { return i.trashed; }).slice(-1)[0];
      if (!t) return log(false, "restore → 404 · not_in_trash", "Nothing in the trash (or it was emptied: test_emptying_the_trash_removes_items_for_good).");
      t.trashed = false;
      log(true, "restore " + t.name + " → 200", "The deletion is undone.");
    },
    empty: function (s, ui, log) {
      var n = s.items.filter(function (i) { return i.trashed; }).length;
      s.items = s.items.filter(function (i) { return !i.trashed; });
      log(true, "empty → 200 · removed " + n, "Trashed rows are gone for good.");
    },
    usage: function (s, ui, log) {
      var used = s.items.reduce(function (sum, i) { return sum + i.size; }, 0);
      log(true, "usage → used " + used, "Counts every row, trashed or not (test_deleting_does_not_free_space_until_the_trash_is_emptied).");
    },
  },
});
