(function () {
  "use strict";

  const DATA = window.MACRO_DATA;
  const NS = "http://www.w3.org/2000/svg";
  const RANGES = { "5Y": 5, "10Y": 10, "All": null };
  const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)"];
  const state = { range: "10Y" };

  // ---------- data helpers ----------
  // Every card has lines: [{label, id, obs: [[date, value], ...]}]. Single-series cards have one line.
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const valid = (line) => line.obs.filter((o) => o[1] !== null);
  const latest = (line) => { const v = valid(line); return v[v.length - 1]; };
  const hasData = (c) => c.lines.some((l) => valid(l).length > 1);
  const live = (c) => c.lines.filter((l) => valid(l).length > 1);

  function yearAgo(line) {
    const v = valid(line);
    const last = toDate(v[v.length - 1][0]);
    const target = Date.UTC(last.getUTCFullYear() - 1, last.getUTCMonth(), 1);
    for (let i = v.length - 1; i >= 0; i--) if (toDate(v[i][0]).getTime() <= target) return v[i];
    return null;
  }

  function fmt(c, x, d) {
    if (x === null || x === undefined) return "–";
    const dec = d === undefined ? c.decimals : d;
    return x.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function periodLabel(c, line, date) {
    const d = toDate(date);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (c.fiscal) return "FY " + y;
    const o = line.obs;
    const q = o.length > 1 && (toDate(o[1][0]).getUTCMonth() - toDate(o[0][0]).getUTCMonth() + 12) % 12 === 3;
    if (q) return "Q" + (Math.floor(m / 3) + 1) + " " + y;
    return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  function cutoff(c, years) {
    if (!years) return -Infinity;
    const end = Math.max(...live(c).map((l) => toDate(latest(l)[0]).getTime()));
    const e = new Date(end);
    // annual series need a longer window to show anything useful
    const span = c.fiscal ? Math.max(years, 10) : years;
    return Date.UTC(e.getUTCFullYear() - span, e.getUTCMonth(), 1);
  }

  function windowed(line, cut) {
    return valid(line).filter((o) => toDate(o[0]).getTime() >= cut);
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => span / x <= count) || mag * 10;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let t = lo; t <= hi + step / 2; t += step) out.push(+t.toFixed(10));
    return out;
  }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function changeText(c, line) {
    const a = yearAgo(line), l = latest(line);
    if (!a) return "";
    const diff = l[1] - a[1];
    if (!diff) return "unchanged from a year earlier";
    const dec = c.decimals === 0 ? 0 : Math.max(c.decimals, 1);
    return `${diff > 0 ? "up" : "down"} ${fmt(c, Math.abs(diff), dec)} from a year earlier`;
  }

  // ---------- page ----------
  function renderNav() {
    const box = document.getElementById("sections-nav");
    box.innerHTML = Object.entries(DATA.sections)
      .map(([key, label]) => `<a href="#${key}">${label}</a>`).join("");
  }

  function readingHtml(c) {
    if (!hasData(c)) return `<div class="empty">Data appears here after the next refresh from FRED.</div>`;
    if (c.lines.length === 1) {
      const line = c.lines[0], l = latest(line);
      return `<div class="reading"><span class="val">${fmt(c, l[1])}</span><span class="unit">${c.unit}</span></div>` +
        `<div class="meta">${periodLabel(c, line, l[0])} · ${changeText(c, line)}</div>`;
    }
    const rows = c.lines.map((line, i) => {
      const l = valid(line).length ? latest(line) : null;
      return `<li><i style="background:${COLORS[i]}"></i><span class="lbl">${line.label}</span>` +
        `<span class="num">${l ? fmt(c, l[1]) : "–"}</span><span class="when">${l ? periodLabel(c, line, l[0]) : "no data yet"}</span></li>`;
    }).join("");
    return `<ul class="multi" aria-label="Latest readings, ${c.unit}">${rows}</ul><div class="meta">${c.unit}</div>`;
  }

  function renderSections() {
    const main = document.getElementById("main");
    main.textContent = "";
    for (const [key, label] of Object.entries(DATA.sections)) {
      const list = DATA.series.filter((c) => c.section === key);
      const sec = document.createElement("section");
      sec.className = "sec";
      sec.id = key;
      sec.innerHTML = `<header class="sec-head"><h2>${label}</h2><p>${(DATA.intros || {})[key] || ""}</p></header>`;
      const grid = document.createElement("div");
      grid.className = "cards";
      for (const c of list) {
        const srcs = (c.sources || c.lines.map((l) => l.id)).map((id) => `<a href="https://fred.stlouisfed.org/series/${id}" target="_blank" rel="noopener">${id}</a>`).join(" ");
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML =
          `<div class="card-head"><h3>${c.title}</h3></div>` +
          readingHtml(c) +
          (hasData(c) ? `<div class="chart" data-key="${c.key}"></div>` : "") +
          `<p class="blurb">${c.blurb}</p>` +
          `<div class="srcs">FRED: ${srcs}</div>`;
        grid.appendChild(card);
      }
      sec.appendChild(grid);
      main.appendChild(sec);
    }
    drawAll();
  }

  function drawAll() {
    document.querySelectorAll(".chart[data-key]").forEach((host) =>
      drawChart(host, DATA.series.find((c) => c.key === host.dataset.key)));
  }

  function drawChart(host, c) {
    host.textContent = "";
    const W = Math.max(280, host.clientWidth || 560), H = Math.round(Math.min(260, Math.max(190, W * 0.46)));
    const m = { t: 12, r: 12, b: 26, l: 46 };
    const cut = cutoff(c, RANGES[state.range]);
    const series = c.lines.map((line, i) => ({ line, i, pts: windowed(line, cut) })).filter((s) => s.pts.length > 1);
    const single = c.lines.length === 1;
    const all = series.flatMap((s) => s.pts);
    const ys = all.map((p) => p[1]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (c.chart === "bar" || lo * hi < 0) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (c.target !== undefined) { lo = Math.min(lo, c.target); hi = Math.max(hi, c.target); }
    // ylim keeps one extreme episode (spring 2020) from flattening the rest of the chart
    const clipped = !!c.ylim && (lo < c.ylim[0] || hi > c.ylim[1]);
    if (c.ylim) { lo = Math.max(lo, c.ylim[0]); hi = Math.min(hi, c.ylim[1]); }
    const ticks = niceTicks(lo, hi, 5);
    lo = ticks[0]; hi = ticks[ticks.length - 1];
    const tickText = (t) => (Math.abs(t) >= 1000 ? t.toLocaleString("en-US") : String(+t.toFixed(2)));
    m.l = Math.max(32, 14 + Math.max(...ticks.map((t) => tickText(t).length)) * 7);

    const times = all.map((p) => toDate(p[0]).getTime());
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const n0 = series[0].pts.length;
    const barGap = c.chart === "bar" ? (t1 - t0) / Math.max(n0 - 1, 1) / 2 : 0;
    const x = (d) => m.l + ((toDate(d).getTime() - t0 + barGap) / (t1 - t0 + 2 * barGap || 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${c.title} chart` }, host);

    // recession bands
    for (const [a, b] of DATA.recessions) {
      const ta = toDate(a).getTime(), tb = toDate(b).getTime() + 30 * 864e5;
      if (tb < t0 || ta > t1) continue;
      const xa = Math.max(m.l, x(a)), xb = Math.min(W - m.r, x(new Date(tb).toISOString().slice(0, 10)));
      el("rect", { x: xa, y: m.t, width: Math.max(0, xb - xa), height: H - m.t - m.b, fill: "var(--band)" }, svg);
    }
    // grid + y labels
    for (const t of ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--muted)" : "var(--line)", "stroke-width": t === 0 ? 1 : 0.75 }, svg);
      const lab = el("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      lab.textContent = tickText(t);
    }
    // x labels: years
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    const every = Math.ceil((y1 - y0 + 1) / Math.max(3, Math.floor(W / 90)));
    for (let yr = y0; yr <= y1; yr++) {
      if ((yr - y0) % every) continue;
      const d = `${yr}-01-01`;
      if (toDate(d).getTime() < t0) continue;
      const xx = x(d);
      el("line", { x1: xx, x2: xx, y1: H - m.b, y2: H - m.b + 4, stroke: "var(--line)" }, svg);
      const lab = el("text", { x: xx, y: H - 8, "text-anchor": "middle" }, svg);
      lab.textContent = yr;
    }
    // target line
    if (c.target !== undefined) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(c.target), y2: y(c.target), stroke: "var(--ink)", "stroke-dasharray": "4 4", "stroke-width": 1 }, svg);
      const lab = el("text", { x: W - m.r - 4, y: y(c.target) - 5, "text-anchor": "end" }, svg);
      lab.textContent = c.target_label || String(c.target);
    }
    // marks, clipped to the plot area
    const clipId = "clip-" + c.key;
    const cp = el("clipPath", { id: clipId }, el("defs", {}, svg));
    el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);
    const g = el("g", { "clip-path": `url(#${clipId})` }, svg);
    if (clipped) {
      const note = document.createElement("div");
      note.className = "cut";
      note.textContent = "Axis is cut off so the spring 2020 extremes don't flatten the rest of the chart. Hover to read them.";
      host.appendChild(note);
    }
    if (c.chart === "bar") {
      const pts = series[0].pts;
      const bw = Math.max(1, ((W - m.l - m.r) / pts.length) - 2);
      for (const [d, v] of pts) {
        const top = y(Math.max(v, 0)), h = Math.max(1, Math.abs(y(v) - y(0)));
        el("rect", { x: x(d) - bw / 2, y: top, width: bw, height: h, rx: Math.min(2, bw / 2), fill: v < 0 ? "var(--neg)" : "var(--accent)" }, g);
      }
    } else {
      for (const s of series) {
        const pts = s.pts, color = COLORS[s.i];
        const d = pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join("");
        if (single) {
          const base = y(Math.max(lo, Math.min(0, hi)));
          el("path", { d: d + `L${x(pts[pts.length - 1][0])} ${base}L${x(pts[0][0])} ${base}Z`, fill: "var(--accent-soft)" }, g);
        }
        el("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }, g);
        const l = pts[pts.length - 1];
        el("circle", { cx: x(l[0]), cy: y(l[1]), r: 4, fill: color, stroke: "var(--surface)", "stroke-width": 2 }, g);
      }
    }

    // hover layer: snap to the nearest date, show every line's value at that date
    const dates = [...new Set(all.map((p) => p[0]))].sort();
    const lookup = series.map((s) => new Map(s.pts.map((p) => [p[0], p[1]])));
    const cross = el("line", { y1: m.t, y2: H - m.b, stroke: "var(--muted)", "stroke-width": 1, visibility: "hidden" }, svg);
    const dots = series.map((s) => el("circle", { r: 4.5, fill: COLORS[s.i], stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    host.appendChild(tip);
    const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    const clampY = (v) => Math.min(H - m.b, Math.max(m.t, y(v)));
    const move = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      let best = dates[0], bd = Infinity;
      for (const d of dates) { const dd = Math.abs(x(d) - px); if (dd < bd) { bd = dd; best = d; } }
      const cx = x(best);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      let topY = H;
      const rows = [];
      series.forEach((s, k) => {
        const v = lookup[k].get(best);
        if (v === undefined) { dots[k].setAttribute("visibility", "hidden"); return; }
        const cy = clampY(v);
        topY = Math.min(topY, cy);
        dots[k].setAttribute("cx", cx); dots[k].setAttribute("cy", cy); dots[k].setAttribute("visibility", "visible");
        rows.push(single ? `${fmt(c, v)} ${c.unit}` : `${s.line.label}: ${fmt(c, v)}`);
      });
      tip.hidden = false;
      tip.textContent = [periodLabel(c, series[0].line, best), ...rows].join(single ? "  " : "\n");
      tip.style.left = Math.min(Math.max((cx / W) * r.width, 70), r.width - 70) + "px";
      tip.style.top = (topY / H) * r.height + "px";
    };
    const leave = () => { cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); tip.hidden = true; };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }

  // ---------- boot ----------
  function init() {
    document.getElementById("updated").textContent = "Data through " + DATA.updated;
    document.querySelectorAll(".ranges button").forEach((b) =>
      b.addEventListener("click", () => {
        state.range = b.dataset.range;
        document.querySelectorAll(".ranges button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        drawAll();
      }));
    renderNav();
    renderSections();
    let t, lastW = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(drawAll, 120);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
