/* to-visual kit: scene helpers + the beat player.
 *
 * A scene is one 1920×1080 composition with ONE paused GSAP timeline, registered at
 * window.__timelines[id] (the HyperFrames composition contract, so an MP4 render stays possible).
 * Beats are timeline labels b1…bN. The player plays one beat, then pauses.
 *
 *   const S = V.scene({ id: "my-scene" });
 *   S.beat("One short caption.", 4.5, t => { S.tl.to(S.q(".box"), { x: 200 }, t + 0.3); });
 *   S.done();
 */
(function () {
  if (window.V) return;
  var NS = "http://www.w3.org/2000/svg";
  var C = {
    ink: "#141413", cream: "#FAF9F5", tile: "#EFE9DE", tileStrong: "#ECE3D4", coral: "#CC785C",
    navy: "#181715", navyElev: "#252320", teal: "#5DB8A6", amber: "#E8A55A", ok: "#5DB872", warn: "#C64545",
    hair: "rgba(20,20,19,.2)", muted: "rgba(20,20,19,.58)",
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  /* Create an SVG element with attributes (use style:"fill:…" for colours GSAP will tween). */
  function svg(tag, attrs, parent, text) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }

  /* One table version as a layer of rows. marks: [[row, col], …] get a coral marker (.tv-mk)
     that starts collapsed; sweep it in with S.mark(). Rows are .r0…, cells .c0…, header row .h. */
  function table(cfg) {
    var mark = {};
    (cfg.marks || []).forEach(function (m) { mark[m[0] + ":" + m[1]] = 1; });
    var style = cfg.widths ? ' style="grid-template-columns:' + cfg.widths + '"' : "";
    function cell(t, r, c) {
      return '<div class="tv-cell c' + c + '">' + (mark[r + ":" + c] ? '<i class="tv-mk"></i>' : "") +
        "<span>" + esc(t) + "</span></div>";
    }
    return '<div class="tv-layer ' + (cfg.cls || "") + '"><div class="tv-row h"' + style + ">" +
      cfg.cols.map(function (t, c) { return cell(t, "h", c); }).join("") + "</div>" +
      cfg.rows.map(function (row, r) {
        return '<div class="tv-row r' + r + '"' + style + ">" + row.map(function (t, c) { return cell(t, r, c); }).join("") + "</div>";
      }).join("") + "</div>";
  }

  /* A hand-drawn ring around (cx, cy): deterministic wobble and a slight overshoot, no randomness. */
  function ring(cx, cy, rx, ry) {
    var pts = [];
    for (var i = 0; i <= 80; i++) {
      var a = -0.6 + (i / 80) * (Math.PI * 2 + 0.45);
      var w = 1 + 0.03 * Math.sin(a * 3 + 0.6);
      pts.push((cx + Math.cos(a) * rx * w).toFixed(1) + " " + (cy + Math.sin(a) * ry * w * (1 + 0.05 * i / 80)).toFixed(1));
    }
    return "M" + pts.join(" L");
  }

  /* Prepare a path for a draw-on: hidden until drawn (a round cap would otherwise show a dot). */
  function drawable(path) {
    var len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 });
    return len;
  }

  function scene(opts) {
    var id = opts.id;
    var root = document.getElementById(id);
    if (!root) throw new Error("to-visual: no composition root #" + id);
    var world = root.querySelector(".tv-world");
    var grain = document.createElement("div");
    grain.className = "tv-grain";
    root.insertBefore(grain, root.firstChild);
    var hud = root.querySelector(".tv-hud");
    if (!hud) { hud = document.createElement("div"); hud.className = "tv-hud"; root.appendChild(hud); }
    var cap = document.createElement("div");
    cap.className = "tv-cap";
    hud.appendChild(cap);
    var tl = gsap.timeline({ paused: true, defaults: { duration: 0.6, ease: "power2.inOut" } });
    var captions = [];
    var T = 0;
    if (world) gsap.set(world, { transformOrigin: "0 0" });

    var S = {
      id: id, root: root, world: world, tl: tl, C: C,
      q: function (s) { return root.querySelector(s); },
      qa: function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); },
      /* Camera: centre world point (cx, cy) on the frame at scale s. Tween the .tv-world with it. */
      cam: function (cx, cy, s) {
        s = s == null ? 1 : s;
        return { x: 960 - cx * s, y: 540 - cy * s, scale: s };
      },
      /* Append a beat: label bN at the current end, crossfade its caption, then build(t) with
         t = the beat's start time. Positions inside build are absolute: t + offset. */
      beat: function (caption, dur, build) {
        var n = captions.length + 1;
        var el = document.createElement("div");
        el.className = "c";
        el.innerHTML = "<em></em><span>" + caption + "</span>";
        cap.appendChild(el);
        captions.push(el);
        tl.addLabel("b" + n, T);
        if (n > 1) tl.to(captions[n - 2], { opacity: 0, duration: 0.25 }, T);
        tl.to(el, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, T + 0.15);
        if (build) build(T);
        T += dur;
        return S;
      },
      /* Sweep coral markers (.tv-mk) in. */
      mark: function (targets, at, extra) {
        tl.to(targets, Object.assign({ scaleX: 1, duration: 0.4, ease: "power2.out" }, extra || {}), at);
        return S;
      },
      /* Draw a prepared path on (see V.drawable). */
      draw: function (path, at, dur) {
        tl.set(path, { opacity: 1 }, at);
        tl.to(path, { strokeDashoffset: 0, duration: dur || 0.9, ease: "power2.out" }, at);
        return S;
      },
      /* Finish: hold the last frame, register the timeline, boot the player. */
      done: function () {
        var N = captions.length;
        captions.forEach(function (el, i) { el.querySelector("em").textContent = pad(i + 1) + " / " + pad(N); });
        gsap.set(captions, { opacity: 0, y: 10 });
        gsap.set(root.querySelectorAll(".tv-mk"), { scaleX: 0, transformOrigin: "left center" });
        tl.set({}, {}, T);
        window.__timelines = window.__timelines || {};
        window.__timelines[id] = tl;
        var fig = root.closest ? root.closest(".tv") : null;
        if (fig) boot(fig, tl, id, N);
        return tl;
      },
    };
    return S;
  }

  /* ---------------- the player ---------------- */
  var players = [];
  var active = null;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function boot(fig, tl, id, N) {
    var vp = fig.querySelector(".tv-viewport");
    var canvas = fig.querySelector(".tv-canvas");
    var start = function (k) { return tl.labels["b" + (k + 1)]; };
    var end = function (k) { return k + 1 < N ? start(k + 1) : tl.duration(); };
    var cur = -1, run = null, visible = 0;

    var overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "tv-overlay";
    overlay.innerHTML = "<div><span>▶ Play the walkthrough</span><small>" + N + " beats · pauses after each</small></div>";
    vp.appendChild(overlay);
    var fs = document.createElement("button");
    fs.type = "button";
    fs.className = "tv-fs";
    fs.title = "Full screen";
    fs.textContent = "⤢";
    vp.appendChild(fs);
    var controls = document.createElement("div");
    controls.className = "tv-controls";
    controls.innerHTML = '<button class="tv-b" type="button" data-a="back">← Back</button>' +
      '<button class="tv-b" type="button" data-a="play">▶ Play</button>' +
      '<button class="tv-b" type="button" data-a="next">Next →</button>' +
      '<div class="tv-beats"></div><span class="tv-count">0 / ' + N + "</span>";
    fig.appendChild(controls);
    var hint = document.createElement("p");
    hint.className = "tv-hint";
    hint.textContent = "→ next beat (or skip to its end) · ← back · space play/pause · R replay beat";
    fig.appendChild(hint);
    var btn = function (a) { return controls.querySelector('[data-a="' + a + '"]'); };
    var count = controls.querySelector(".tv-count");
    var fills = [];
    for (var k = 0; k < N; k++) {
      var seg = document.createElement("button");
      seg.type = "button";
      seg.className = "tv-seg";
      seg.setAttribute("aria-label", "Play beat " + (k + 1));
      seg.innerHTML = "<i></i>";
      seg.onclick = (function (kk) { return function () { playBeat(kk); }; })(k);
      controls.querySelector(".tv-beats").appendChild(seg);
      fills.push(seg.firstChild);
    }

    function fit() {
      var w = vp.clientWidth, h = vp.clientHeight, s = Math.min(w / 1920, h / 1080);
      canvas.style.transform = "translate(" + (w - 1920 * s) / 2 + "px," + (h - 1080 * s) / 2 + "px) scale(" + s + ")";
    }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(vp);
    fit();

    function atEnd() { return cur >= 0 && tl.time() >= end(cur) - 0.01; }
    function sync() {
      var t = tl.time();
      fills.forEach(function (f, i) {
        f.style.width = Math.max(0, Math.min(1, (t - start(i)) / (end(i) - start(i)))) * 100 + "%";
        f.parentNode.classList.toggle("on", i === cur);
      });
      count.textContent = Math.max(cur + 1, 0) + " / " + N;
      var playing = run && !run.paused();
      btn("play").textContent = playing ? "❚❚ Pause" : run ? "▶ Resume" : atEnd() && cur === N - 1 ? "↻ Replay" : "▶ Play";
      btn("back").disabled = cur <= 0 && !run;
      btn("next").disabled = cur >= N - 1 && !run;
    }
    function playBeat(k) {
      active = api;
      cur = Math.max(0, Math.min(N - 1, k));
      overlay.hidden = true;
      if (run) run.kill();
      run = null;
      if (reduce) { tl.seek(end(cur)); sync(); return; }
      tl.seek(start(cur));
      run = tl.tweenFromTo(start(cur), end(cur), { onUpdate: sync, onComplete: function () { run = null; sync(); } });
      sync();
    }
    function seekEnd(k) {
      if (run) run.kill();
      run = null;
      cur = Math.max(0, Math.min(N - 1, k));
      overlay.hidden = true;
      tl.seek(end(cur));
      sync();
    }
    function next() { if (run) seekEnd(cur); else if (cur < N - 1) playBeat(cur + 1); }
    function back() {
      if (cur <= 0) return playBeat(0);
      if (run && tl.time() - start(cur) > 1) return playBeat(cur);
      playBeat(cur - 1);
    }
    function toggle() {
      if (run) { run.paused(!run.paused()); return sync(); }
      if (cur < 0) return playBeat(0);
      if (atEnd() && cur < N - 1) return playBeat(cur + 1);
      playBeat(cur === N - 1 && atEnd() ? 0 : cur);
    }
    function reset() {
      if (run) run.kill();
      run = null;
      cur = -1;
      tl.seek(0);
      overlay.hidden = false;
      sync();
    }

    overlay.onclick = function () { playBeat(0); };
    btn("next").onclick = next;
    btn("back").onclick = back;
    btn("play").onclick = toggle;
    fs.onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (fig.requestFullscreen) fig.requestFullscreen();
    };
    fig.addEventListener("pointerdown", function () { active = api; });
    fig.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { b.blur(); }); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { visible = es[0].intersectionRatio; }, { threshold: [0, 0.25, 0.5, 0.75, 1] }).observe(vp);
    } else visible = 1;

    var api = {
      id: id, beats: N, timeline: tl,
      seekBeatEnd: seekEnd, playBeat: playBeat, next: next, back: back, toggle: toggle, reset: reset,
      replay: function () { if (cur >= 0) playBeat(cur); },
      inView: function () { return visible >= 0.5 || document.fullscreenElement === fig; },
    };
    players.push(api);
    window.__visuals = window.__visuals || {};
    window.__visuals[id] = api;
    if (!window.__visual) window.__visual = api;
    if (!active) active = api;

    tl.seek(0);
    sync();
    // ?beat=N (or ?beat=id:N on a page with several players) opens on the end of beat N.
    var m = /[?&]beat=(?:([a-z0-9-]+):)?(\d+)/.exec(location.search);
    if (m && (m[1] ? m[1] === id : api === window.__visual)) seekEnd(parseInt(m[2], 10) - 1);
  }

  document.addEventListener("keydown", function (e) {
    var p = active;
    if (!p || !p.inView() || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT|SUMMARY/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); p.next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); p.back(); }
    else if (e.key === " ") { e.preventDefault(); p.toggle(); }
    else if (e.key === "r" || e.key === "R") { p.replay(); }
    else if (e.key === "Home") { e.preventDefault(); p.reset(); }
  });

  window.V = { scene: scene, svg: svg, table: table, ring: ring, drawable: drawable, esc: esc, C: C, NS: NS };
})();
