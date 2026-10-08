/* to-visual trace template: a recorded trace played as beats.
 * Left: actors as a sequence diagram, one recorded request per row (current row in coral).
 * Right: the concept's state as tables, one snapshot per beat; new/changed rows are marked,
 * rows that disappeared are struck through. A chip names the test and step of each beat.
 * Data comes from scripts/concept_view.py; you never write this by hand. */
(function () {
  if (!window.V || window.V.trace) return;
  var esc = V.esc;

  V.trace = function (data, opts) {
    var id = opts.id, root = document.getElementById(id);
    var beats = data.beats, actors = data.actors, n = beats.length;
    if (!n) throw new Error("to-visual trace: no beats");
    var laneLeft = 80, laneWidth = 920, slot = laneWidth / actors.length;
    var X = {};
    actors.forEach(function (a, i) { X[a.id] = laneLeft + (i + 0.5) * slot; });
    var firstTrap = beats.findIndex(function (b) { return b.trap; });
    var gap = firstTrap > 0 ? 30 : 0;
    var step = Math.min(58, (860 - 300 - gap) / Math.max(1, n - 1));
    var rowY = function (k) { return 300 + k * step + (firstTrap > 0 && k >= firstTrap ? gap : 0); };

    root.insertAdjacentHTML("beforeend",
      '<div class="tv-hud"><div class="tv-hk"><b>✱</b> ' + esc(data.kicker || "concept") + "</div>" +
      '<div class="tv-hh" style="font-size:52px">' + esc(data.headline || "") + "</div>" +
      '<div class="tvt-prov"></div><div class="tvt-cast"></div>' +
      '<div class="tvt-panel"><div class="tv-k tvt-k"><b>✱</b> state · recorded rows</div></div></div>');
    var q = function (s) { return root.querySelector(s); };
    var cast = q(".tvt-cast"), panel = q(".tvt-panel"), prov = q(".tvt-prov");
    var w = Math.min(210, slot - 20);

    var lanes = V.svg("svg", { class: "tvt-lanes", viewBox: "0 0 1920 1080" }, cast);
    actors.forEach(function (a) {
      V.svg("line", { x1: X[a.id], y1: 262, x2: X[a.id], y2: 892, "stroke-dasharray": "4 6", style: "stroke:rgba(20,20,19,.22);stroke-width:2" }, lanes);
      cast.insertAdjacentHTML("beforeend", '<div class="tvt-actor" style="left:' + X[a.id] + "px;width:" + w + "px;margin-left:" + (-w / 2) + 'px"><b>' +
        esc(a.name) + "</b><i>" + esc(a.sub || "") + "</i></div>");
    });
    var divider = null;
    if (firstTrap > 0) {
      cast.insertAdjacentHTML("beforeend", '<div class="tvt-divider" style="top:' + (rowY(firstTrap) - 52) + 'px">' + esc(data.divider || "OTHER RECORDED TESTS") + '</div>');
      divider = q(".tvt-divider");
    }

    var rows = beats.map(function (b, k) {
      if (!(b.from in X) || !(b.to in X)) throw new Error("to-visual trace: unknown actor in beat " + (k + 1));
      var y = rowY(k), dir = X[b.to] >= X[b.from] ? 1 : -1;
      var x1 = X[b.from] + 8 * dir, x2 = X[b.to] - 12 * dir;
      var line = V.svg("path", { d: "M" + x1 + " " + y + " L" + x2 + " " + y, style: "fill:none;stroke:" + V.C.coral + ";stroke-width:3" }, lanes);
      var head = V.svg("path", { d: "M" + (x2 - 12 * dir) + " " + (y - 7) + " L" + (x2 + 2 * dir) + " " + y + " L" + (x2 - 12 * dir) + " " + (y + 7) + " Z", style: "fill:" + V.C.coral }, lanes);
      var left = Math.min(x1, x2), right = Math.max(x1, x2);
      cast.insertAdjacentHTML("beforeend", '<div class="tvt-label tvt-l' + k + '" style="left:' + (left + 6) + "px;top:" + (y - 27) + 'px">' + esc(b.req) + "</div>");
      cast.insertAdjacentHTML("beforeend", '<div class="tvt-chip tvt-c' + k + " " + (b.ok ? "ok" : "bad") + '" style="right:' + (1920 - right - 4) + "px;top:" + (y + 5) + 'px">' + esc(b.res) + "</div>");
      prov.insertAdjacentHTML("beforeend", "<span>" + esc(b.prov) + "</span>");
      return { line: line, head: head, label: q(".tvt-l" + k), chip: q(".tvt-c" + k) };
    });

    var snaps = beats.map(function (b) {
      var el = document.createElement("div");
      el.className = "tvt-snap";
      el.innerHTML = data.tables.map(function (t) {
        var cols = t.widths || ["150px"].concat(t.cols.slice(1).map(function () { return "1fr"; }));
        var rs = b.tables[t.id] || [];
        var body = rs.length ? rs.map(function (r) {
          return '<div class="tvt-row ' + r.flag + '" style="grid-template-columns:' + cols.join(" ") + '">' +
            (r.flag === "new" || r.flag === "changed" ? '<i class="tv-mk"></i>' : "") +
            r.cells.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>";
        }).join("") : '<div class="tvt-row none"><span>none</span></div>';
        return '<div class="tvt-tbl"><h4>' + esc(t.title) + " · " + t.cols.map(esc).join(" · ") + "</h4>" + body + "</div>";
      }).join("");
      panel.appendChild(el);
      return el;
    });

    var S = V.scene({ id: id }), tl = S.tl;
    var provs = Array.prototype.slice.call(prov.children);
    rows.forEach(function (r) { V.drawable(r.line); });
    gsap.set(rows.map(function (r) { return r.head; }).concat(rows.map(function (r) { return r.label; }), rows.map(function (r) { return r.chip; }), provs, snaps), { opacity: 0 });
    if (divider) gsap.set(divider, { opacity: 0 });

    beats.forEach(function (b, k) {
      S.beat(b.caption, 4.2, function (t) {
        if (k > 0) {
          var p = rows[k - 1];
          tl.to(p.line, { stroke: V.C.ink, opacity: 0.3, duration: 0.3 }, t + 0.2);
          tl.to(p.head, { fill: V.C.ink, opacity: 0.3, duration: 0.3 }, t + 0.2);
          tl.to([p.label, p.chip], { opacity: 0.35, duration: 0.3 }, t + 0.2);
          tl.to(provs[k - 1], { opacity: 0, duration: 0.2 }, t + 0.1);
          tl.set(snaps[k - 1], { opacity: 0 }, t + 1.0);
        }
        if (divider && k === firstTrap) tl.to(divider, { opacity: 1, duration: 0.4 }, t + 0.1);
        tl.to(provs[k], { opacity: 1, duration: 0.3 }, t + 0.2);
        tl.to(rows[k].label, { opacity: 1, duration: 0.3 }, t + 0.3);
        S.draw(rows[k].line, t + 0.35, 0.65);
        tl.to(rows[k].head, { opacity: 1, duration: 0.15 }, t + 0.95);
        tl.set(snaps[k], { opacity: 1 }, t + 1.0);
        var marks = snaps[k].querySelectorAll(".tv-mk");
        if (marks.length) S.mark(marks, t + 1.05, { stagger: 0.08 });
        var gone = snaps[k].querySelectorAll(".tvt-row.gone");
        if (gone.length) tl.fromTo(gone, { opacity: 1 }, { opacity: 0.35, duration: 0.6, immediateRender: false }, t + 1.3);
        tl.to(rows[k].chip, { opacity: 1, duration: 0.3 }, t + 1.5);
      });
    });
    return S.done();
  };
})();
