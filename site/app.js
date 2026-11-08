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
    if (window.NEWS_DATA && window.NEWS_DATA.items && window.NEWS_DATA.items.length) top.news = "News";
    top.questions = "Big questions";
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
    EXTRA.length = 0;
    main.appendChild(latestSection());
    const news = newsSection();
    if (news) main.appendChild(news);
    main.appendChild(questionsSection());
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
    const cut = cutoff(c, c.years || RANGES[state.range]);
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
      const lab = c.target_left ? el("text", { x: m.l + 6, y: y(c.target) - 5, "text-anchor": "start" }, svg)
        : el("text", { x: W - m.r - 4, y: y(c.target) - 5, "text-anchor": "end" }, svg);
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
        const stroke = { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" };
        if (s.line.dash) stroke["stroke-dasharray"] = "5 4";
        el("path", stroke, g);
        if (s.line.marks) for (const p of pts.slice(1)) el("circle", { cx: x(p[0]), cy: y(p[1]), r: 4, fill: color, stroke: "var(--surface)", "stroke-width": 2 }, g);
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

  // ---------- big questions: plain answers to what people ask, written from the newest data ----------
  // Like "The latest", every answer is generated from data/series.js, so it changes when the data does.
  const ex = (key) => ((DATA.extras || {})[key] || []).filter((o) => o[1] !== null);
  const exLast = (key) => { const v = ex(key); return v.length ? v[v.length - 1] : null; };
  const monthLabel = (d) => toDate(d).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthsBack = (arr, n) => (arr.length > n ? arr[arr.length - 1 - n] : null);
  const avg3 = (arr, k) => avg(arr.slice(arr.length - 3 - (k || 0), arr.length - (k || 0)).map((o) => o[1]));
  const addMonths = (d, n) => { const t = toDate(d); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1)).toISOString().slice(0, 10); };
  const lineCard = (key, title, unit, lines, opts) => Object.assign({ key, title, unit, decimals: 1, chart: "line", years: 5, lines }, opts || {});
  const moved = (x, unit) => (Math.abs(x) < 0.05 ? "about unchanged" : `${x > 0 ? "up" : "down"} ${Math.abs(x).toFixed(1)} ${unit}`);

  // Pace of a price index over the last n months, at an annual rate.
  const paceOf = (lv, n) => (lv.length > n ? (Math.pow(lv[lv.length - 1][1] / lv[lv.length - 1 - n][1], 12 / n) - 1) * 100 : null);

  function qInflation() {
    const yo = obsOf("PCEPI"), core = obsOf("PCEPILFE"), lv = ex("PCE_LEVEL"), clv = ex("CORE_PCE_LEVEL");
    if (!yo) return null;
    const now = yo[yo.length - 1], ago6 = monthsBack(yo, 6), ago12 = monthsBack(yo, 12);
    const ev = [];
    const pace6 = paceOf(lv, 6), pace3 = paceOf(lv, 3);
    // carry the last six months' pace forward and watch the 12-month rate converge to it
    let hit = null, proj = [];
    if (lv.length >= 13 && pace6 !== null) {
      const n = lv.length, g = Math.pow(lv[n - 1][1] / lv[n - 7][1], 1 / 6), levels = lv.map((o) => o[1]);
      proj = [[lv[n - 1][0], +now[1].toFixed(2)]];
      for (let k = 1; k <= 12; k++) {
        levels.push(levels[levels.length - 1] * g);
        const yoy = (levels[levels.length - 1] / levels[levels.length - 13] - 1) * 100, d = addMonths(lv[n - 1][0], k);
        proj.push([d, +yoy.toFixed(2)]);
        if (hit === null && yoy <= 2.2) hit = d;
      }
    }
    const trend = ago6 ? (now[1] > ago6[1] + 0.2 ? "rising" : now[1] < ago6[1] - 0.2 ? "falling" : "flat") : null;
    const F = window.FOMC_SEP;
    const fedYear = F ? F.years.find((y, i) => F.median.pce[i] <= 2.0) : null;
    let tone, answer;
    if (now[1] <= 2.2) { tone = "good"; answer = "It's essentially there: headline PCE inflation, the measure the Fed's 2% goal is written in, is within a whisker of 2%."; }
    else if (F && fedYear && +fedYear >= toDate(now[0]).getUTCFullYear() + 2) {
      tone = "concern";
      answer = `Not until ${fedYear}, by the Fed's own projections. Headline PCE inflation, the measure the 2% goal is written in, is ${pct(now[1])}` +
        (trend === "rising" ? ` and moving away from target (${pct(ago6[1])} six months ago)` : "") +
        `, and the median Fed official doesn't see it back at 2.0% until the end of ${fedYear}.`;
    }
    else if (trend === "rising") { tone = "concern"; answer = `Not soon. Headline PCE inflation, the measure the Fed's 2% goal is written in, is ${pct(now[1])} and moving away from target, up from ${pct(ago6[1])} six months ago.`; }
    else if (hit) { tone = "watch"; answer = `Headline PCE inflation is ${pct(now[1])}. If prices keep rising at their pace of the past six months, it would reach about 2% around ${monthLabel(hit)}.`; }
    else { tone = now[1] >= 3 ? "concern" : "watch"; answer = `Not on the current pace. Headline PCE inflation is ${pct(now[1])}${pace6 !== null ? `, and prices have risen at a ${pct(pace6)} annual rate over the past six months` : ""}.`; }
    ev.push(`The Fed defines its 2% goal in terms of <b>headline PCE</b> prices, everything consumers buy including food and energy. That's up <b>${pct(now[1])}</b> from a year earlier (${when("PCEPI", now)})` +
      (ago6 && ago12 ? `, ${trend === "flat" ? "about the same as" : trend === "rising" ? "up from" : "down from"} ${pct(ago6[1])} six months ago and ${pct(ago12[1])} a year ago.` : ".") +
      (pace6 !== null ? ` Over the last six months prices rose at a <b>${pct(pace6)}</b> annual rate (${pct(pace3)} over the last three).` : ""));
    if (F) {
      const path = F.years.map((y, i) => `${F.median.pce[i].toFixed(1)}% in ${y}`).join(", ");
      const ff = lastOf("FEDFUNDS");
      ev.push(`<b>The Fed's own forecast</b> (<a href="${F.url}" target="_blank" rel="noopener">${F.label} projections</a>, median): headline PCE inflation of ${path}. ` +
        `Core PCE: ${F.median.core_pce.map((v, i) => `${v.toFixed(1)}% in ${F.years[i]}`).join(", ")}.` +
        (ff ? ` Officials see the federal funds rate at ${F.median.fedfunds[0].toFixed(1)}% at the end of ${F.years[0]}, versus ${pct(ff[1], 2)} now${F.median.fedfunds[0] > ff[1] + 0.1 ? ", which points to a possible further rate increase, not cuts" : ""}.` : ""));
    }
    if (core) {
      const c = core[core.length - 1], cp6 = paceOf(clv, 6);
      ev.push(`Core PCE, which leaves out food and energy and is the Fed's best guide to where headline inflation is heading, is up <b>${pct(c[1])}</b>` +
        (cp6 !== null ? `, rising at a ${pct(cp6)} pace over six months.` : ".") +
        (now[1] > c[1] + 0.3 ? " The gap between the two is energy." : ""));
    }
    const wti = lastOf("CRUDE"), wtiAgo = backOf("CRUDE", 12), gas = lastOf("GASREGCOVM");
    if (wti && wtiAgo) { const oc = (wti[1] / wtiAgo[1] - 1) * 100; ev.push(`Oil averaged <b>$${wti[1].toFixed(0)}</b> a barrel in ${when("CRUDE", wti)}, ${oc >= 0 ? "up" : "down"} ${Math.abs(oc).toFixed(0)}% from a year earlier${gas ? `, with gasoline at $${gas[1].toFixed(2)} a gallon` : ""}.`); }
    const sh = exLast("SHELTER"), cg = exLast("CORE_GOODS");
    if (sh || cg) ev.push([sh ? `Housing costs (CPI shelter) are up <b>${pct(sh[1])}</b> from a year earlier` : "",
      cg ? `${sh ? "and" : ""} goods excluding food and energy are ${cg[1] >= 0 ? "up" : "down"} <b>${pct(Math.abs(cg[1]))}</b>` : ""].filter(Boolean).join(" ") + ` (${monthLabel((sh || cg)[0])}).`);
    const card = lineCard("Q_INFL", "PCE inflation", "% y/y", [
      { label: "Headline PCE", id: "PCEPI", obs: yo },
      ...(core ? [{ label: "Core PCE", id: "PCEPILFE", obs: core }] : []),
      ...(F ? [{ label: `Fed projection, headline (${F.label})`, id: "FOMC_SEP", dash: true, marks: true,
        obs: [[now[0], +now[1].toFixed(2)], ...F.years.map((y, i) => [`${y}-12-01`, F.median.pce[i]])] }]
        : proj.length ? [{ label: "Headline, if the 6-month pace holds", id: "projection", obs: proj, dash: true }] : [])],
      { target: 2, target_label: "Fed target 2%", target_left: !!F, years: 6 });
    return { q: "When will inflation get back to the Fed's 2% target?", tone, answer, ev, card, link: "prices",
      change: "Sooner if oil prices fall back, since energy is what's keeping headline above core. Later if high energy costs spread into other prices or tariffs keep pushing goods prices up." };
  }

  function qAI() {
    const u = obsOf("UNRATE"), y = ex("UNRATE_20_24"), col = ex("UNRATE_COLLEGE"), tech = ex("TECH_JOBS"), info = ex("INFO_JOBS");
    if (!u) return null;
    const ev = [];
    const broad = u.length > 27 ? avg3(u) - avg3(u, 24) : null;
    const young = y.length > 27 ? avg3(y) - avg3(y, 24) : null;
    const grads = col.length > 27 ? avg3(col) - avg3(col, 24) : null;
    const techYoY = tech.length > 13 ? (tech[tech.length - 1][1] / monthsBack(tech, 12)[1] - 1) * 100 : null;
    const techPeak = tech.length ? tech.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
    const entry = young !== null && broad !== null && young - broad >= 0.7;
    const infoYoY = info.length > 13 ? (info[info.length - 1][1] / monthsBack(info, 12)[1] - 1) * 100 : null;
    const techDown = (techYoY !== null && techYoY <= -1) || (infoYoY !== null && infoYoY <= -2);
    let tone, answer;
    if (broad !== null && broad >= 0.5) { tone = "concern"; answer = "Unemployment is rising across the board, which looks more like a slowing economy than AI. That makes any AI effect hard to separate."; }
    else if (entry && techDown) { tone = "watch"; answer = "Not across the economy, but the early signs are where you'd expect them: younger workers and tech jobs."; }
    else if (entry) { tone = "watch"; answer = "Not across the economy. Younger workers are having a harder time finding jobs, which fits AI replacing entry-level tasks, but also a slow-hiring market."; }
    else if (techDown) { tone = "watch"; answer = "Not across the economy, but jobs are shrinking in tech and information, the industries most exposed to AI. Young workers aren't seeing a clear hit yet."; }
    else { tone = "good"; answer = "Not in the numbers yet. Unemployment, young-worker joblessness and tech employment show no clear AI-driven break."; }
    if (broad !== null) {
      const fl = findCard("JOLTS_FLOWS");
      const hires = fl && valid(fl.lines[0]).slice(-1)[0], lay = fl && valid(fl.lines[2]).slice(-1)[0];
      ev.push(`Overall unemployment is <b>${pct(u[u.length - 1][1])}</b>, ${moved(broad, "points")} from two years ago.` +
        (hires && lay ? ` Layoffs are low (${pct(lay[1])} of jobs a month) but so is hiring (${pct(hires[1])}), so job seekers find it harder to get hired.` : ""));
    }
    if (young !== null) ev.push(`Unemployment for ages 20 to 24 is <b>${pct(avg3(y))}</b> (three-month average), ${moved(young, "points")} from two years ago` +
      (grads !== null ? `; for college graduates 25 and older it's ${pct(avg3(col))}, ${moved(grads, "points")}.` : "."));
    if (techYoY !== null) {
      const lastT = tech[tech.length - 1], fromPeak = (lastT[1] / techPeak[1] - 1) * 100;
      let s = `Jobs in computer systems design, the industry closest to AI's coding tools, are ${techYoY >= 0 ? "up" : "down"} <b>${Math.abs(techYoY).toFixed(1)}%</b> from a year earlier`;
      s += fromPeak < -1 ? ` and ${Math.abs(fromPeak).toFixed(0)}% below their ${monthLabel(techPeak[0])} peak.` : ".";
      if (infoYoY !== null) s += ` Information-sector jobs (publishing, software, telecom, data processing) are ${infoYoY >= 0 ? "up" : "down"} <b>${Math.abs(infoYoY).toFixed(1)}%</b>.`;
      ev.push(s);
    }
    const pr = exLast("PRODUCTIVITY");
    if (pr) ev.push(`Output per hour worked is up <b>${pct(pr[1])}</b> from a year earlier (${qLabel(pr[0])}). Faster productivity is how AI would show up if it makes workers more efficient rather than replacing them.`);
    const lines = [{ label: "Ages 20 to 24", id: "LNS14000036", obs: y }, { label: "All workers", id: "UNRATE", obs: u }];
    if (col.length) lines.push({ label: "College grads, 25+", id: "LNS14027662", obs: col });
    const card = lineCard("Q_AI", "Unemployment rate by group", "%", lines, { ylim: [0, 16] });
    return { q: "Is AI really taking jobs?", tone, answer, ev, card, link: "jobs",
      note: "No official statistic counts jobs lost to AI. These are the places it would show up first.",
      change: "A clear sign would be young-worker and college-grad unemployment rising while the rest of the job market stays solid, and tech or office-support jobs falling as productivity speeds up." };
  }

  function qGrowth() {
    const g = obsOf("A191RL1Q225SBEA");
    if (!g) return null;
    const M = DATA.model, f = M && (M.nowcast || M.forecast);
    const last = g[g.length - 1], prev = g[g.length - 2];
    const ev = [];
    const u = obsOf("UNRATE");
    let sahm = null;
    if (u) { const lows = []; for (let k = 1; k <= 12; k++) lows.push(avg3(u, k)); sahm = avg3(u) - Math.min(...lows); }
    const curve = lastOf("T10Y2Y"), cl = lastOf("ICSA"), clAgo = backOf("ICSA", 12);
    const claimsCh = cl && clAgo ? (cl[1] / clAgo[1] - 1) * 100 : null;
    const flags = [sahm !== null && sahm >= 0.5, curve && curve[1] < 0, claimsCh !== null && claimsCh >= 15, f && f.value < 0.5];
    const n = flags.filter(Boolean).length;
    let tone, answer;
    if (n === 0) {
      tone = "good";
      answer = f && f.value < last[1] - 1 ? `Holding up. Growth is likely slowing this quarter (our model says about ${pct(f.value)}), but none of the classic recession warnings is flashing.`
        : "Holding up, and none of the classic recession warnings is flashing.";
    } else if (n === 1) { tone = "watch"; answer = "Slowing, with one recession warning light on. One signal on its own has given false alarms before."; }
    else { tone = "concern"; answer = `Recession risk is rising: ${n} of the four warning lights we track are on.`; }
    ev.push(`Real GDP grew at a <b>${pct(last[1])}</b> annual rate in ${qLabel(last[0])}${prev ? `, after ${pct(prev[1])} the quarter before` : ""}.` +
      (f ? ` The model on this page puts ${qLabel(f.quarter)} at about <b>${pct(f.value)}</b> (range ${f.low.toFixed(1)}% to ${f.high.toFixed(1)}%).` : ""));
    const lights = [];
    if (sahm !== null) lights.push(`the Sahm rule gap is ${signed(sahm, 2)} points (0.5 signals a recession)`);
    if (curve) lights.push(`the yield curve is ${signed(curve[1], 2)} points (${curve[1] < 0 ? "inverted" : "not inverted"})`);
    if (claimsCh !== null) lights.push(`jobless claims are ${signed(claimsCh, 0)}% from a year earlier`);
    if (lights.length) ev.push(`Warning lights: ${lights.join("; ")}.`);
    const F = window.FOMC_SEP;
    if (F) ev.push(`Fed officials (${F.label} projections, median) expect real GDP growth of <b>${F.median.gdp[0].toFixed(1)}%</b> in ${F.years[0]} and ${F.median.gdp[1].toFixed(1)}% in ${F.years[1]}, with unemployment steady at ${F.median.unrate[0].toFixed(1)}%. No recession is in their forecast.`);
    const pce = lastOf("PCEC96");
    if (pce) ev.push(`Consumer spending, two thirds of the economy, is up <b>${pct(pce[1])}</b> after inflation over the past year.`);
    const card = { key: "Q_GDP", title: "Real GDP growth", unit: "% annualized", decimals: 1, chart: "bar", years: 5,
      lines: [{ label: "Real GDP growth", id: "A191RL1Q225SBEA", obs: g }] };
    return { q: "Is growth holding up, or is a recession coming?", tone, answer, ev, card, link: "outlook",
      change: "A jump in layoffs or jobless claims, or consumers cutting spending as gasoline and borrowing costs bite." };
  }

  // Savings above or below the 2015-2019 saving rate, added up month by month from March 2020 ($ trillions).
  function excessSavings() {
    const sav = obsOf("PSAVERT"), inc = ex("DSPI");
    if (!sav || !inc.length) return null;
    const base = avg(sav.filter((o) => o[0] >= "2015-01-01" && o[0] < "2020-01-01").map((o) => o[1]));
    const income = new Map(inc.map((o) => [o[0], o[1]]));
    let total = 0;
    const out = [];
    for (const [d, r] of sav) {
      if (d < "2020-03-01" || !income.has(d)) continue;
      total += ((r - base) / 100) * income.get(d) / 12 / 1000;
      out.push([d, +total.toFixed(3)]);
    }
    if (!out.length) return null;
    const peak = out.reduce((a, b) => (b[1] > a[1] ? b : a));
    const gone = out.find((o) => o[0] > peak[0] && o[1] <= 0);
    return { base, out, peak, last: out[out.length - 1], gone };
  }

  function qConsumer() {
    const pce = lastOf("PCEC96"), inc = lastOf("DSPIC96"), sav = obsOf("PSAVERT");
    if (!pce) return null;
    const ev = [];
    const s = sav ? sav[sav.length - 1] : null;
    const ahe = lastOf("CES0500000003"), cpi = obsOf("CPIAUCSL");
    let real = null;
    if (ahe && cpi) { const c = cpi.find((o) => o[0] === ahe[0]) || cpi[cpi.length - 1]; real = { v: ahe[1] - c[1], d: c[0] }; }
    const del = lastOf("DELINQUENCY"), delAgo = backOf("DELINQUENCY", 4);
    const xs = excessSavings();
    const depleted = xs && xs.last[1] <= 0;
    // The 2025 tax law cut taxes retroactively for 2025, so it showed up in early-2026 income and saving.
    const tax = sav ? sav.filter((o) => o[0] >= "2026-01-01" && o[0] <= "2026-05-01") : [];
    const taxPeak = tax.length ? tax.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
    const taxFaded = taxPeak && s && s[0] > taxPeak[0] && s[1] <= taxPeak[1] - 0.8;
    const thin = s && xs && s[1] < xs.base - 1;
    let tone, answer;
    if (pce[1] < 1) { tone = "concern"; answer = "Pulling back: spending after inflation has nearly stopped growing."; }
    else if (depleted && taxFaded && real && real.v < 0) { tone = "concern"; answer = "Still spending, but the cushions are running out: pandemic-era savings are gone, the boost from this year's tax cuts has largely been spent, and paychecks are trailing prices."; }
    else if ((real && real.v < 0) || (inc && inc[1] < pce[1] - 1 && thin) || depleted) { tone = "watch"; answer = taxFaded
      ? "Still spending, but on a thinner cushion: spending is outpacing income, the boost from this year's tax cuts has faded, and households are saving less to keep it up."
      : "Still spending, but on a thinner cushion: spending is outpacing income, and households are saving less to keep it up."; }
    else if (pce[1] >= 2) { tone = "good"; answer = "Healthy: spending and income are both growing after inflation."; }
    else { tone = "watch"; answer = "Okay, but spending growth has slowed."; }
    ev.push(`Spending after inflation is up <b>${pct(pce[1])}</b> from a year earlier` +
      (inc ? `; after-tax income after inflation is up only <b>${pct(inc[1])}</b> (${when("DSPIC96", inc)}).` : "."));
    if (xs) ev.push(`<b>Pandemic savings:</b> households built up about <b>$${xs.peak[1].toFixed(1)} trillion</b> more than usual by ${monthLabel(xs.peak[0])}. ` +
      (xs.last[1] <= 0 ? `It's all been spent${xs.gone ? ` (gone by ${monthLabel(xs.gone[0])})` : ""}; measured against their 2015–2019 saving habit, households are now about <b>$${Math.abs(xs.last[1]).toFixed(1)} trillion</b> behind.`
        : (() => {
          const yr = monthsBack(xs.out, 12), burn = yr ? yr[1] - xs.last[1] : 0;
          let t = `About <b>$${xs.last[1].toFixed(1)} trillion</b> of it is left by this measure`;
          if (burn > 0.05) {
            t += `, but households drew down <b>$${(burn * 1000).toFixed(0)} billion</b> of it over the past year`;
            const yrs = xs.last[1] / burn;
            t += yrs <= 4 ? `; at that pace it would be gone around ${toDate(addMonths(xs.last[0], Math.round(yrs * 12))).getUTCFullYear()}.` : ".";
          } else t += ".";
          return t;
        })()));
    if (taxPeak && s) ev.push(`<b>Tax cuts:</b> the 2025 tax law (the "One Big Beautiful Bill") cut taxes retroactively, so bigger refunds and lower withholding lifted income early this year. The saving rate rose to <b>${pct(taxPeak[1])}</b> in ${monthLabel(taxPeak[0])}` +
      (taxFaded ? `, and has since fallen to <b>${pct(s[1])}</b> (${monthLabel(s[0])}), so that money has likely been spent.` : `; it's ${pct(s[1])} now.`));
    if (real) ev.push(`Hourly pay is up ${pct(ahe[1])} against prices up ${pct(ahe[1] - real.v)}, so ${real.v >= 0 ? `real wages are rising by about <b>${pct(real.v)}</b>` : `paychecks are <b>falling behind</b> prices by ${pct(-real.v)}`} (${monthLabel(real.d)}).` +
      (del ? ` ${pct(del[1], 2)} of credit card balances are delinquent${delAgo ? `, ${del[1] >= delAgo[1] ? "up" : "down"} ${Math.abs(del[1] - delAgo[1]).toFixed(2)} points in a year` : ""}.` : ""));
    const E = window.EARNINGS_SUMMARY;
    if (E && E.verdict) ev.push(`Companies' read from their latest earnings: <b>${E.verdict}</b>. <a href="earnings/index.html">See what ${E.companies} companies are saying →</a>`);
    const card = xs
      ? { key: "Q_CONS", title: "Pandemic savings still unspent, $ trillions", unit: "$ trillions", decimals: 1, chart: "line", years: 7,
          lines: [{ label: "Excess savings", id: "PSAVERT", obs: xs.out }] }
      : lineCard("Q_CONS", "Spending vs income, after inflation", "% y/y", [
          { label: "Real consumer spending", id: "PCEC96", obs: obsOf("PCEC96") },
          ...(obsOf("DSPIC96") ? [{ label: "Real disposable income", id: "DSPIC96", obs: obsOf("DSPIC96") }] : [])], { years: 3 });
    return { q: "How healthy is the U.S. consumer?", tone, answer, ev, card, link: "consumer",
      note: xs ? "Excess savings: each month's saving above or below the 2015–2019 average saving rate, added up from March 2020. A common way to estimate it; the exact number depends on the baseline." : null,
      change: "Watch whether job growth keeps income rising. With savings already drawn down, spending now depends on paychecks, so a hiring slowdown would hit it quickly." };
  }

  function questionsSection() {
    const sec = document.createElement("section");
    sec.className = "sec";
    sec.id = "questions";
    const qs = [];
    for (const fn of [qInflation, qAI, qGrowth, qConsumer]) { try { const r = fn(); if (r) qs.push(r); } catch (e) { /* skip */ } }
    const short = { good: "Good news", watch: "Mixed", concern: "Worrying" };
    const body = qs.map((q) => {
      EXTRA.push(q.card);
      return `<article class="question card"><div class="punch-top"><span class="topic">Big question</span><span class="tag ${q.tone}">${short[q.tone]}</span></div>` +
        `<h3>${q.q}</h3><p class="answer">${q.answer}</p>` +
        `<div class="qchart"><div class="card-head"><h4>${q.card.title}</h4></div>${q.card.lines.length > 1 ? readingHtml(q.card) : ""}<div class="chart" data-key="${q.card.key}"></div></div>` +
        `<h4>The evidence</h4><ul class="ev">${q.ev.map((e) => `<li>${e}</li>`).join("")}</ul>` +
        (q.note ? `<p class="qnote">${q.note}</p>` : "") +
        `<p class="change"><b>What would change the answer:</b> ${q.change}</p>` +
        `<a class="more" href="#${q.link}">See the charts →</a></article>`;
    }).join("");
    sec.innerHTML = `<header class="sec-head"><h2>Big questions</h2><p>Straight answers to what people are asking about the economy, written automatically from the latest data on this page.</p></header>` +
      `<div class="questions">${body}</div>`;
    return sec;
  }

  // ---------- latest news: headlines from free RSS feeds (data/news.js, refreshed by scripts/fetch_news.py) ----------
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
  const ago = (iso) => {
    const h = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (h < 1) return "just now";
    if (h < 24) return `${Math.round(h)}h ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  // Where each topic leads on this page
  const TOPIC_LINK = { "Fed & rates": "money", "Inflation": "prices", "Jobs": "jobs", "Growth": "outlook", "Consumer": "consumer",
    "Housing": "money", "Energy": "energy", "Budget & taxes": "budget", "Banks & credit": "credit" };

  function newsSection() {
    const N = window.NEWS_DATA;
    if (!N || !N.items || !N.items.length) return null;
    const sec = document.createElement("section");
    sec.className = "sec";
    sec.id = "news";
    const top = N.items.slice(0, 3), rest = N.items.slice(3, 18);
    const tags = (it) => it.topics.map((t) => `<span class="ntag">${esc(t)}</span>`).join("");
    const feat = top.map((it) => {
      const rel = it.topics.find((t) => TOPIC_LINK[t]);
      return `<article class="card nfeat"><div class="nsrc"><b>${esc(it.source)}</b><span>${ago(it.published)}</span></div>` +
        `<h3><a href="${safeUrl(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>` +
        (it.summary ? `<p>${esc(it.summary)}</p>` : "") +
        `<div class="ntags">${tags(it)}</div>` +
        `<div class="nfoot"><a href="${safeUrl(it.link)}" target="_blank" rel="noopener">Read at ${esc(it.source)} →</a>` +
        (rel ? `<a href="#${TOPIC_LINK[rel]}">${esc(rel)} data on this page</a>` : "") + `</div></article>`;
    }).join("");
    const topics = [...new Set(rest.flatMap((it) => it.topics))];
    const rows = rest.map((it) =>
      `<li data-topics="${esc(it.topics.join("|"))}"><a href="${safeUrl(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` +
      `<span class="nmeta">${esc(it.source)} · ${ago(it.published)}</span></li>`).join("");
    sec.innerHTML =
      `<header class="sec-head"><h2>Latest news</h2><p>The most relevant economy headlines of the past few days from the WSJ, FT, New York Times and other outlets, plus Fed and budget research. Summaries are each outlet's own; links go to the original, which may be paywalled.</p></header>` +
      `<div class="nfeats">${feat}</div>` +
      (rest.length ? `<div class="card nmore"><div class="nmore-head"><h3>More headlines</h3>` +
        `<div class="nfilter" role="group" aria-label="Filter by topic"><button type="button" aria-pressed="true" data-t="">All</button>` +
        topics.map((t) => `<button type="button" aria-pressed="false" data-t="${esc(t)}">${esc(t)}</button>`).join("") + `</div></div>` +
        `<ul class="nlist">${rows}</ul></div>` : "") +
      `<p class="nupd">Headlines collected ${new Date(N.updated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</p>`;
    sec.querySelectorAll(".nfilter button").forEach((b) => b.addEventListener("click", () => {
      sec.querySelectorAll(".nfilter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      sec.querySelectorAll(".nlist li").forEach((li) => { li.hidden = !!b.dataset.t && !li.dataset.topics.split("|").includes(b.dataset.t); });
    }));
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
