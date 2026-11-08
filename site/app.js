(function () {
  "use strict";

  const DATA = window.MACRO_DATA;
  const NS = "http://www.w3.org/2000/svg";
  const RANGES = { "5Y": 5, "10Y": 10, "All": null };
  const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)"];
  const state = { range: "10Y" };
  const EXTRA = []; // charts drawn outside the card grid (the GDP outlook)
  const findCard = (key) => DATA.series.concat(EXTRA).find((c) => c.key === key);

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
    const top = { latest: "The latest" };
    if (DATA.model) top.outlook = "GDP outlook";
    box.innerHTML = Object.entries(Object.assign(top, DATA.sections))
      .map(([key, label]) => `<a href="#${key}">${label}</a>`).join("") +
      `<a class="out" href="earnings/index.html">Company earnings →</a>`;
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
    main.appendChild(latestSection());
    if (DATA.model) main.appendChild(outlookSection());
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
      drawChart(host, findCard(host.dataset.key)));
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

  // ---------- the latest: punchlines written from the newest numbers ----------
  // Every sentence below is generated from data/series.js, so the narrative updates with each refresh.
  function obsOf(key, i) {
    const c = findCard(key);
    if (!c || !c.lines[i || 0]) return null;
    const v = valid(c.lines[i || 0]);
    return v.length ? v : null;
  }
  const lastOf = (key, i) => { const v = obsOf(key, i); return v ? v[v.length - 1] : null; };
  const backOf = (key, n, i) => { const v = obsOf(key, i); return v && v.length > n ? v[v.length - 1 - n] : null; };
  const when = (key, o, i) => { const c = findCard(key); return periodLabel(c, c.lines[i || 0], o[0]); };
  const pct = (x, d) => (x === null || x === undefined ? "–" : x.toFixed(d === undefined ? 1 : d) + "%");
  const signed = (x, d) => {
    const t = Math.abs(x).toFixed(d === undefined ? 1 : d);
    return (+t === 0 ? "" : x > 0 ? "+" : "−") + t;
  };
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const qLabel = (d) => { const t = toDate(d); return "Q" + (Math.floor(t.getUTCMonth() / 3) + 1) + " " + t.getUTCFullYear(); };
  const TONE = { good: "Healthy", watch: "Watch", concern: "Concern" };

  function punchlines() {
    const out = [];
    const M = DATA.model;

    // Growth
    const g = lastOf("A191RL1Q225SBEA");
    if (g) {
      const v = g[1];
      const head = v >= 2.5 ? "The economy is growing at a solid clip" : v >= 1 ? "Growth is positive but modest"
        : v >= 0 ? "Growth has nearly stalled" : "The economy shrank last quarter";
      let text = `Real GDP grew at a ${pct(v)} annual rate in ${when("A191RL1Q225SBEA", g)}.`;
      const f = M && (M.nowcast || M.forecast);
      if (f) text += ` Our model puts ${qLabel(f.quarter)} at about ${pct(f.value)}, with a typical miss of ±${(f.high - f.value).toFixed(1)} points.`;
      out.push({ topic: "Growth", tone: v >= 2 ? "good" : v >= 0.5 ? "watch" : "concern", head, text });
    }

    // Labor market
    const u = obsOf("UNRATE"), p = obsOf("PAYEMS");
    if (u && p) {
      const now = u[u.length - 1][1];
      const avg3 = (k) => avg(u.slice(u.length - 3 - k, u.length - k).map((o) => o[1]));
      const lows = []; for (let k = 1; k <= 12; k++) lows.push(avg3(k));
      const rise = avg3(0) - Math.min(...lows);
      const jobs3 = avg(p.slice(-3).map((o) => o[1]));
      const ratio = lastOf("OPENINGS_PER_UNEMPLOYED");
      const head = rise >= 0.5 ? "The job market is weakening" : jobs3 < 50 ? "Hiring has slowed to a crawl"
        : jobs3 < 125 ? "The job market is cooling, not cracking" : "Employers are still hiring at a healthy pace";
      let text = `Unemployment is ${pct(now)} (${when("UNRATE", u[u.length - 1])}), and payrolls have grown by about ${Math.round(jobs3)}k a month over the last three months.`;
      if (ratio) text += ` There are ${ratio[1].toFixed(2)} job openings for every unemployed person.`;
      out.push({ topic: "Labor market", tone: rise >= 0.5 ? "concern" : jobs3 < 100 || rise >= 0.3 ? "watch" : "good", head, text });
    }

    // Inflation
    const core = lastOf("PCEPILFE"), cpi = lastOf("CPIAUCSL");
    if (core) {
      const prev = backOf("PCEPILFE", 6);
      const v = core[1];
      const dir = prev ? (v < prev[1] - 0.15 ? "easing" : v > prev[1] + 0.15 ? "picking up" : "flat") : "";
      const head = v <= 2.3 ? "Inflation is back near the Fed's 2% goal" : v <= 3
        ? (dir === "easing" ? "Inflation is above target but easing" : dir === "picking up" ? "Inflation is above target and creeping up" : "Inflation is stuck above target")
        : "Inflation is running hot";
      let text = `Core PCE prices, the Fed's preferred gauge, are up ${pct(v)} from a year earlier (${when("PCEPILFE", core)})`;
      text += prev ? `, versus ${pct(prev[1])} six months before.` : ".";
      if (cpi) text += ` Headline CPI is up ${pct(cpi[1])}.`;
      out.push({ topic: "Inflation", tone: v <= 2.3 ? "good" : v <= 3 ? "watch" : "concern", head, text });
    }

    // Consumer spending
    const pce = lastOf("PCEC96"), rs = lastOf("RSAFS"), inc = lastOf("DSPIC96"), sav = lastOf("PSAVERT");
    if (pce) {
      const v = pce[1];
      const head = v >= 2.5 ? "Households are still spending freely" : v >= 1 ? "Consumer spending is growing modestly" : "Consumers are pulling back";
      let text = `Inflation-adjusted consumer spending is up ${pct(v)} from a year earlier (${when("PCEC96", pce)}).`;
      if (rs) text += ` Retail sales are up ${pct(rs[1])} before adjusting for prices.`;
      if (inc && sav) {
        text += inc[1] < v ? ` Real disposable income is growing more slowly (${pct(inc[1])}), so households are leaning on savings: the saving rate is ${pct(sav[1])}.`
          : ` Real disposable income is up ${pct(inc[1])} and the saving rate is ${pct(sav[1])}.`;
      }
      out.push({ topic: "Consumer spending", tone: v >= 2 ? "good" : v >= 0.5 ? "watch" : "concern", head, text });
    }

    // Rates and energy
    const ten = lastOf("DGS10"), tenAgo = backOf("DGS10", 12), wti = lastOf("CRUDE"), wtiAgo = backOf("CRUDE", 12), gas = lastOf("GASREGCOVM");
    if (ten && wti) {
      const oil = wtiAgo ? (wti[1] / wtiAgo[1] - 1) * 100 : 0;
      const head = oil >= 20 ? "Oil prices have jumped" : tenAgo && ten[1] - tenAgo[1] >= 0.5 ? "Long-term borrowing costs are climbing" : "Rates and energy are steady";
      let text = `The 10-year Treasury yield is ${pct(ten[1], 2)}${tenAgo ? ` (${signed(ten[1] - tenAgo[1], 2)} points over the year)` : ""}.`;
      text += ` WTI crude averaged $${wti[1].toFixed(0)} a barrel in ${when("CRUDE", wti)}${wtiAgo ? `, ${oil >= 0 ? "up" : "down"} ${Math.abs(oil).toFixed(0)}% from a year earlier` : ""}`;
      text += gas ? `, and regular gasoline cost $${gas[1].toFixed(2)} a gallon.` : ".";
      out.push({ topic: "Rates & energy", tone: oil >= 20 ? "concern" : oil >= 10 ? "watch" : "good", head, text });
    }
    return out;
  }

  // Each risk returns [tone, reading, note] or null when the data isn't there.
  function risks() {
    const list = [];
    const add = (name, fn) => { try { const r = fn(); if (r) list.push({ name, tone: r[0], reading: r[1], note: r[2] }); } catch (e) { /* skip */ } };
    add("Inverted yield curve", () => {
      const v = lastOf("T10Y2Y")[1];
      return [v < 0 ? "concern" : v < 0.5 ? "watch" : "good", `${signed(v, 2)} pts`,
        v < 0 ? "Short rates above long rates have preceded most recessions."
          : v < 0.5 ? "10-year minus 2-year yield. Positive again, but the curve is still flat by historical standards."
            : "10-year minus 2-year yield. Long rates above short rates is the normal shape."];
    });
    add("Rising unemployment", () => {
      const u = obsOf("UNRATE");
      const a3 = (k) => avg(u.slice(u.length - 3 - k, u.length - k).map((o) => o[1]));
      const lows = []; for (let k = 1; k <= 12; k++) lows.push(a3(k));
      const r = a3(0) - Math.min(...lows);
      return [r >= 0.5 ? "concern" : r >= 0.3 ? "watch" : "good", `${signed(r, 2)} pts`,
        "Three-month average jobless rate versus its low of the past year. A rise of 0.5 points (the Sahm rule) has marked the start of recessions."];
    });
    add("Layoffs picking up", () => {
      const n = lastOf("ICSA")[1], a = backOf("ICSA", 12)[1], ch = (n / a - 1) * 100;
      return [ch >= 15 ? "concern" : ch >= 5 ? "watch" : "good", `${signed(ch, 0)}% y/y`, `Initial jobless claims average ${Math.round(n)}k a week.`];
    });
    add("Sticky inflation", () => {
      const v = lastOf("PCEPILFE")[1];
      return [v >= 3 ? "concern" : v >= 2.5 ? "watch" : "good", pct(v), "Core PCE inflation. Above 2.5% keeps the Fed cautious about cutting rates."];
    });
    add("Oil price shock", () => {
      const n = lastOf("CRUDE")[1], a = backOf("CRUDE", 12)[1], ch = (n / a - 1) * 100;
      return [ch >= 30 ? "concern" : ch >= 15 ? "watch" : "good", `${signed(ch, 0)}% y/y`, `WTI at $${n.toFixed(0)} a barrel. Sharp oil rises feed inflation and squeeze budgets.`];
    });
    add("Banks tightening credit", () => {
      const v = lastOf("SLOOS_CI")[1];
      return [v >= 20 ? "concern" : v >= 5 ? "watch" : "good", `${signed(v, 1)} net %`, "Share of banks tightening business loan standards, from the Fed's loan officer survey."];
    });
    add("Household credit stress", () => {
      const n = lastOf("DELINQUENCY")[1], a = backOf("DELINQUENCY", 4)[1];
      return [n >= 3.5 ? "concern" : n >= 3 || n - a >= 0.3 ? "watch" : "good", pct(n, 2), `Credit card delinquency rate, ${n >= a ? "up" : "down"} ${Math.abs(n - a).toFixed(2)} points over the year.`];
    });
    add("Thin savings cushion", () => {
      const v = lastOf("PSAVERT")[1];
      return [v < 3 ? "concern" : v < 4.5 ? "watch" : "good", pct(v), "Personal saving rate. A low rate leaves less room to keep spending if income slows."];
    });
    add("Tighter financial conditions", () => {
      const v = lastOf("NFCI")[1];
      return [v > 0 ? "concern" : v > -0.3 ? "watch" : "good", v.toFixed(2), "Chicago Fed index. Above zero means credit is tighter than average."];
    });
    add("Rising long-term rates", () => {
      const n = lastOf("DGS10")[1], a = backOf("DGS10", 12)[1], ch = n - a;
      return [ch >= 1 ? "concern" : ch >= 0.5 ? "watch" : "good", `${signed(ch, 2)} pts y/y`, `10-year yield at ${n.toFixed(2)}%. Higher long rates raise mortgage and business borrowing costs.`];
    });
    const order = { concern: 0, watch: 1, good: 2 };
    return list.sort((a, b) => order[a.tone] - order[b.tone]);
  }

  // A pointer to the Consumer Earnings Monitor (earnings/), from data/earnings_summary.js
  function earningsTeaser() {
    const E = window.EARNINGS_SUMMARY;
    if (!E || !E.headline) return "";
    const V = { strong: "Strong", steady: "Steady", choosy: "Choosy", strained: "Strained" };
    const tone = { strong: "good", steady: "good", choosy: "watch", strained: "concern" }[E.verdict] || "watch";
    return `<a class="earn" href="earnings/index.html"><div class="punch-top"><span class="topic">What companies are saying${E.as_of ? ` · ${E.as_of}` : ""}</span>` +
      `<span class="tag ${tone}">Consumer: ${V[E.verdict] || E.verdict}</span></div>` +
      `<h3>${E.headline}</h3><p>${E.summary || ""}</p>` +
      `<span class="go">Read the latest earnings from ${E.companies} companies across ${E.sectors.length} sectors →</span></a>`;
  }

  function latestSection() {
    const sec = document.createElement("section");
    sec.className = "sec";
    sec.id = "latest";
    const cards = punchlines().map((p) =>
      `<article class="punch"><div class="punch-top"><span class="topic">${p.topic}</span><span class="tag ${p.tone}">${TONE[p.tone]}</span></div>` +
      `<h3>${p.head}</h3><p>${p.text}</p></article>`).join("");
    const rk = risks();
    const flagged = rk.filter((r) => r.tone !== "good").length;
    const rows = rk.map((r) =>
      `<li class="${r.tone}"><span class="dot"></span><span class="rname">${r.name}</span><span class="rval">${r.reading}</span>` +
      `<span class="tag ${r.tone}">${r.tone === "good" ? "Calm" : TONE[r.tone]}</span><span class="rnote">${r.note}</span></li>`).join("");
    sec.innerHTML =
      `<header class="sec-head"><h2>The latest</h2><p>Where the economy stands, in a sentence or two per topic. Written automatically from the newest numbers on this page.</p></header>` +
      `<div class="punches">${cards}</div>` +
      `<div class="risks"><h3>Key risks to watch <span>${flagged} of ${rk.length} flashing</span></h3><ul>${rows}</ul></div>` +
      earningsTeaser();
    return sec;
  }

  // ---------- GDP outlook: the bridge-equation model ----------
  function outlookSection() {
    const M = DATA.model;
    const sec = document.createElement("section");
    sec.className = "sec";
    sec.id = "outlook";
    const main = M.nowcast || M.forecast;
    const info = M.nowcast ? M.models[0] : M.models[1];
    const kind = M.nowcast ? "nowcast" : "forecast";
    const lastFit = M.fitted.find((f) => f[0] === M.last_actual[0]);
    const rows = (M.nowcast ? M.nowcast.inputs.map((x) => ({ label: `${x.label} (${x.months} of 3 months in)`, val: pct(x.growth), c: x.contribution }))
      : M.forecast.inputs.map((x) => ({ label: x.label + (x.label.startsWith("Yield") ? "" : `, ${qLabel(M.forecast.based_on)}`), val: x.label.startsWith("Yield") ? `${x.value.toFixed(2)} pts` : pct(x.value), c: x.contribution })));
    const table = `<table class="contrib"><thead><tr><th>Input</th><th>Reading</th><th>Adds</th></tr></thead><tbody>` +
      `<tr><td>Starting point (average growth)</td><td></td><td>${signed(main.constant, 2)}</td></tr>` +
      rows.map((r) => `<tr><td>${r.label}</td><td>${r.val}</td><td>${signed(r.c, 2)}</td></tr>`).join("") +
      `<tr class="sum"><td>Model ${kind}</td><td></td><td>${main.value.toFixed(2)}%</td></tr></tbody></table>`;

    EXTRA.length = 0;
    const fc = { key: "GDP_MODEL", title: "GDP growth: actual vs model", unit: "% annualized", decimals: 1, chart: "line", ylim: [-10, 10],
      lines: [{ label: "Actual GDP growth", id: "A191RL1Q225SBEA", obs: M.actual },
              { label: "Model estimate", id: "model", obs: M.fitted },
              { label: "Forecast", id: "forecast", obs: M.nowcast ? [] : [M.last_actual, [M.forecast.quarter, M.forecast.value]] }] };
    EXTRA.push(fc);
    const models = M.models.map((m) => `<li><b>${m.name}.</b> Fit on ${m.n} quarters (${qLabel(m.fit_start)} to ${qLabel(m.fit_end)}); explains ${Math.round(m.r2 * 100)}% of the ups and downs. ` +
      `Out-of-sample typical miss: ±${m.oos_rmse} points. Coefficients: ${m.coefs.map((c) => `${c.label} ${c.value}`).join(", ")}.</li>`).join("");

    sec.innerHTML =
      `<header class="sec-head"><h2>GDP outlook</h2><p>A simple, transparent model of real GDP growth built from the monthly data on this page.</p></header>` +
      `<div class="outlook">` +
      `<article class="card hero"><div class="kicker">${qLabel(main.quarter)} real GDP growth, model ${kind}</div>` +
      `<div class="big">${main.value.toFixed(1)}<span>%</span></div>` +
      `<div class="meta">Annualized. Typical miss: ${main.low.toFixed(1)}% to ${main.high.toFixed(1)}%.</div>` +
      `<p class="blurb">Last reported: <b>${pct(M.last_actual[1])}</b> in ${qLabel(M.last_actual[0])}` +
      (lastFit ? ` (the model had ${pct(lastFit[1])}).` : ".") +
      (M.nowcast ? "" : ` No monthly data for ${qLabel(main.quarter)} is out yet, so this is a one-quarter-ahead forecast from ${qLabel(M.forecast.based_on)} data. It switches to a nowcast as October numbers arrive.`) + `</p>` +
      `<h4>What's behind the number</h4>${table}</article>` +
      `<article class="card"><div class="card-head"><h3>${fc.title}</h3></div>` +
      `<ul class="multi">${fc.lines.map((l, i) => `<li><i style="background:${COLORS[i]}"></i><span class="lbl">${l.label}</span><span class="num"></span><span class="when"></span></li>`).join("")}</ul>` +
      `<div class="chart" data-key="GDP_MODEL"></div>` +
      `<details class="how"><summary>How the model works</summary>` +
      `<p>It's a "bridge equation", the same basic idea the Atlanta Fed and others use. Monthly data on payroll jobs, industrial production and inflation-adjusted consumer spending is averaged by quarter, turned into annualized growth, and regressed on real GDP growth. ` +
      `When some months of a quarter are out, the model nowcasts that quarter, holding missing months at the latest reading. Before any are out, a second equation forecasts it from the previous quarter's data, GDP growth and the yield curve. ` +
      `${qLabel(M.excluded[0])} to ${qLabel(M.excluded[1])} is left out of the fit because the pandemic swings would dominate it. The model refits every time the data refreshes.</p>` +
      `<ul>${models}</ul><p>It's a rough guide, not an official forecast: real-time misses are larger than these figures because the data gets revised.</p></details>` +
      `</article></div>`;
    return sec;
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
