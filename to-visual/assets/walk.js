/* to-visual walk template: the step-through JSON (title, lede, panes, steps, cards) rendered
 * in the beat player. One step = one beat. Code panes highlight lines; world panes show the
 * step's cards. A card whose id is new slides in; a card whose status changed pulses. */
(function () {
  if (!window.V || window.V.walk) return;
  var esc = V.esc;
  // `backticks` in a caption become inline code; everything else is escaped text.
  function caption(s) { return esc(s || "").replace(/`([^`]+)`/g, "<code>$1</code>"); }

  function card(c) {
    var status = c.status || "ready";
    var spin = status === "io" ? '<span class="spin">◐</span>' : "";
    var body = "";
    if (c.lines && c.lines.length) {
      var hl = {};
      (c.highlight || []).forEach(function (n) { hl[n] = 1; });
      body = "<pre>" + c.lines.map(function (l, i) {
        return '<span class="ln' + (hl[i + 1] ? " hl" : "") + '">' + (esc(l) || " ") + "</span>";
      }).join("") + "</pre>";
    } else if (c.note) {
      body = '<div class="note">' + esc(c.note) + "</div>";
    }
    return '<div class="tv-wcard ' + esc(status) + '"><div class="wh"><span>' + esc(c.title || c.id) +
      '</span><span class="st">' + spin + esc(status) + "</span></div>" + (body ? '<div class="wb">' + body + "</div>" : "") + "</div>";
  }

  function stack(list, x, w, top, bottom) {
    var gap = 20, h = (bottom - top - gap * (list.length - 1)) / list.length;
    return list.map(function (p, i) { return { p: p, x: x, y: top + i * (h + gap), w: w, h: h }; });
  }
  function paneEl(root, cls, b, title) {
    var el = document.createElement("div");
    el.className = "tv-pane " + cls;
    el.style.cssText = "left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px";
    el.innerHTML = '<div class="ph">' + esc(title) + '</div><div class="pb"></div>';
    root.appendChild(el);
    return el.querySelector(".pb");
  }

  V.walk = function (data, opts) {
    var id = opts.id, root = document.getElementById(id);
    var panes = data.panes || [], steps = data.steps || [];
    if (!steps.length) throw new Error("to-visual walk: no steps");
    root.insertAdjacentHTML("beforeend",
      '<div class="tv-k tv-walk-k"><b>✱</b> Step through</div>' +
      '<div class="tv-walk-title">' + esc(data.title || "Walkthrough") + "</div>" +
      (data.lede ? '<div class="tv-walk-lede">' + esc(data.lede) + "</div>" : ""));

    var codeP = panes.filter(function (p) { return p.kind === "code"; });
    var worldP = panes.filter(function (p) { return p.kind !== "code"; });
    var top = data.lede ? 214 : 186, bottom = 890;
    var leftW = worldP.length && codeP.length ? 960 : 1760;
    var codeBoxes = stack(codeP, 80, leftW, top, bottom);
    var worldBoxes = codeP.length ? stack(worldP, 80 + leftW + 24, 1760 - leftW - 24, top, bottom) : stack(worldP, 80, 1760, top, bottom);

    // code panes: one highlight bar per line, faded in/out per step
    var bars = {};
    codeBoxes.forEach(function (b) {
      var lines = b.p.lines || [];
      var n = Math.max(lines.length, 1);
      var maxChars = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([24]));
      var font = Math.min(26, (b.h - 48 - 36) / n / 1.55, (b.w - 40) / (maxChars * 0.6));
      var lh = font * 1.55;
      var pb = paneEl(root, "code", b, b.p.title || b.p.id);
      pb.innerHTML = '<div class="tv-listing" style="font-size:' + font.toFixed(2) + "px;line-height:" + lh.toFixed(2) + 'px">' +
        lines.map(function (_, i) { return '<i class="hl" style="top:' + (i * lh).toFixed(2) + "px;height:" + lh.toFixed(2) + 'px"></i>'; }).join("") +
        lines.map(function (l) { return '<span class="ln">' + (esc(l) || " ") + "</span>"; }).join("") + "</div>";
      bars[b.p.id] = Array.prototype.slice.call(pb.querySelectorAll(".hl"));
    });

    // world panes: one snapshot of cards per step, swapped at the beat
    var snaps = {};
    worldBoxes.forEach(function (b) {
      var pb = paneEl(root, "world", b, b.p.title || b.p.id);
      var avail = b.h - 48 - 36;
      snaps[b.p.id] = steps.map(function (st) {
        var cards = (st.world || {})[b.p.id] || [];
        var s = document.createElement("div");
        s.className = "tv-snap";
        s.innerHTML = cards.length ? cards.map(card).join("") : '<div class="tv-wempty">Nothing scheduled.</div>';
        pb.appendChild(s);
        if (s.scrollHeight > avail) gsap.set(s, { scale: avail / s.scrollHeight });
        return s;
      });
    });

    var S = V.scene({ id: id }), tl = S.tl;
    Object.keys(bars).forEach(function (k) { gsap.set(bars[k], { opacity: 0 }); });
    Object.keys(snaps).forEach(function (k) { gsap.set(snaps[k], { opacity: 0 }); });
    var prevHl = {}, prevCards = {};
    steps.forEach(function (st, k) {
      S.beat(caption(st.caption), 1.8, function (t) {
        Object.keys(bars).forEach(function (pid) {
          var on = {}, was = prevHl[pid] || {}, up = [], down = [];
          ((st.highlight || {})[pid] || []).forEach(function (n) { on[n - 1] = 1; });
          bars[pid].forEach(function (bar, i) {
            if (on[i] && !was[i]) up.push(bar);
            if (!on[i] && was[i]) down.push(bar);
          });
          if (down.length) tl.to(down, { opacity: 0, duration: 0.25 }, t + 0.1);
          if (up.length) tl.to(up, { opacity: 1, duration: 0.3 }, t + 0.15);
          prevHl[pid] = on;
        });
        Object.keys(snaps).forEach(function (pid) {
          if (k > 0) tl.set(snaps[pid][k - 1], { opacity: 0 }, t + 0.1);
          tl.set(snaps[pid][k], { opacity: 1 }, t + 0.1);
          var cards = (st.world || {})[pid] || [], was = prevCards[pid] || {}, now = {};
          var els = snaps[pid][k].querySelectorAll(".tv-wcard");
          cards.forEach(function (c, i) {
            var key = c.id || c.title;
            now[key] = c.status || "ready";
            if (!(key in was)) tl.from(els[i], { x: -18, opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, t + 0.1);
            else if (was[key] !== now[key]) tl.from(els[i], { scale: 0.96, duration: 0.3, ease: "power2.out", immediateRender: false }, t + 0.1);
            var spin = els[i].querySelector(".spin");
            if (spin) tl.to(spin, { rotation: 360, duration: 1.6, ease: "none" }, t + 0.1);
          });
          prevCards[pid] = now;
        });
      });
    });
    return S.done();
  };
})();
