/* to-visual concept-view helpers (page level, outside the 1920×1080 stage).
 *   V.inventory(el, { concepts, syncs, order })   — the concepts a change touches + synchronizations
 *   V.machine(el, def)                            — play: actions as buttons, state as tables, a log
 *   V.quiz(el, questions)                         — check: multiple choice with a "why" per option
 * You supply data (and, for the machine, the concept's rules). Styles live in concept.css under .tvc. */
(function () {
  if (!window.V || window.V.machine) return;
  var esc = V.esc;

  V.inventory = function (el, data) {
    var cards = (data.concepts || []).map(function (c) {
      var badge = c.status ? '<span class="tvc-b ' + (c.status.toLowerCase() === "new" ? "new" : "chg") + '">' + esc(c.status.toUpperCase()) + "</span>" : "";
      return '<div class="tvc-card' + (c.star ? " star" : "") + '">' + badge + '<div class="tvc-n">' + esc(c.name) + (c.star ? " ★" : "") + "</div>" +
        "<p>" + esc(c.purpose || "") + "</p>" + (c.familiar ? '<p class="tvc-fam">Familiar as: ' + esc(c.familiar) + "</p>" : "") +
        (c.tests ? '<div class="tvc-t">' + esc(c.tests) + "</div>" : "") + "</div>";
    });
    if (data.order && data.order.length)
      cards.push('<div class="tvc-card dashed"><div class="tvc-n">dependence order</div><p class="tvc-dep">' + data.order.map(esc).join("<br>") + "</p></div>");
    var syncs = (data.syncs || []).length ? '<h3>Synchronizations: when one concept acts, another acts too</h3><table class="tvc-syncs"><tr><th>when…</th><th>…then</th><th>evidence</th></tr>' +
      data.syncs.map(function (s) {
        return "<tr><td>" + esc(s.when) + "</td><td>" + esc(s.then) + "</td><td>" + esc(s.evidence || "") +
          (s.recorded ? ' <span class="tvc-rec">● RECORDED</span>' : "") + "</td></tr>";
      }).join("") + "</table>" : "";
    el.innerHTML = '<div class="tvc-grid">' + cards.join("") + "</div>" + syncs;
  };

  V.machine = function (el, def) {
    var state, log, last = {};
    var controls = (def.groups || []).map(function (g) {
      return '<div class="tvc-grp"><h4>' + esc(g.title) + "</h4>" + g.controls.map(function (c) {
        if (c.select) return '<select data-s="' + esc(c.select) + '">' + c.options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>";
        return '<button type="button" data-a="' + esc(c.action) + '">' + esc(c.label) + "</button>";
      }).join("") + "</div>";
    }).join("") + '<div class="tvc-grp"><button type="button" data-a="__reset">Reset</button></div>';
    el.innerHTML = '<div class="tvc-machine-grid"><div class="tvc-ctl">' + controls + '</div><div class="tvc-state"><div class="tvc-tables"></div><div class="tvc-log"></div></div></div>';
    var ui = { get: function (name) { var s = el.querySelector('[data-s="' + name + '"]'); return s ? s.value : undefined; } };
    var write = function (ok, line, why) { log.unshift({ ok: ok, line: line, why: why || "" }); };

    function render() {
      var rows = def.rows(state), seen = {};
      el.querySelector(".tvc-tables").innerHTML = def.tables.map(function (t) {
        var list = rows[t.id] || [];
        var cols = (t.widths || ["110px"].concat(t.cols.slice(1).map(function () { return "1fr"; }))).join(" ");
        var body = list.length ? list.map(function (r) {
          var key = t.id + ":" + r.key, sig = r.cells.join("|"), fresh = last[key] !== sig;
          seen[key] = sig;
          return '<div class="tvc-r' + (fresh ? " fresh" : "") + (r.dead ? " dead" : "") + '" style="grid-template-columns:' + cols + '">' +
            r.cells.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>";
        }).join("") : '<div class="tvc-none">none</div>';
        return '<div class="tvc-tb"><h5>' + esc(t.title) + " · " + t.cols.map(esc).join(" · ") + "</h5>" + body + "</div>";
      }).join("");
      last = seen;
      el.querySelector(".tvc-log").innerHTML = log.map(function (e) {
        return '<div class="' + (e.ok ? "ok" : "bad") + '">' + esc(e.line) + (e.why ? "<em>" + esc(e.why) + "</em>" : "") + "</div>";
      }).join("");
    }
    function reset() { state = def.init(); log = []; last = {}; }
    el.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (!a) return;
      if (a === "__reset") reset();
      else if (def.actions[a]) def.actions[a](state, ui, write);
      render();
      e.target.blur();
    });
    reset();
    last = {};
    render();
    return { state: function () { return state; }, render: render };
  };

  V.quiz = function (el, questions) {
    questions.forEach(function (q, i) {
      var d = document.createElement("div");
      d.className = "tvc-q";
      d.innerHTML = '<div class="tvc-stem">' + (i + 1) + ". " + esc(q.q) + (q.tag ? '<span class="tvc-tag">● ' + esc(q.tag) + "</span>" : "") + "</div>" +
        q.options.map(function (o, j) { return '<button type="button" data-j="' + j + '">' + esc(o[0]) + "</button>"; }).join("") + '<div class="tvc-why"></div>';
      d.addEventListener("click", function (e) {
        var j = e.target.getAttribute && e.target.getAttribute("data-j");
        if (j === null || j === undefined) return;
        var o = q.options[+j];
        e.target.classList.add(o[1] ? "right" : "wrong");
        var why = d.querySelector(".tvc-why");
        why.textContent = (o[1] ? "Correct. " : "Not quite. ") + o[2];
        why.classList.add("show");
      });
      el.appendChild(d);
    });
  };
})();
