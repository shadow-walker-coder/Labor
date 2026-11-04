/* Retail Earnings Monitor: renders window.RETAIL_DATA (built by scripts/build.py).
   No framework, no build step. Charts are small hand-written SVG / HTML. */
(function () {
  "use strict";
  const D = window.RETAIL_DATA;
  const app = document.getElementById("app");
  if (!D) { app.innerHTML = '<p class="wrap">No data yet. Run <code>python retail/scripts/build.py</code>.</p>'; return; }

  // ---------- helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const pct = (v, d = 1) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + "%" : "—");
  const cls = (v) => (isNum(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
  const median = (xs) => { const a = xs.filter(isNum).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const today = new Date().toISOString().slice(0, 10);

  const retailers = Object.fromEntries(D.retailers.map((r) => [r.ticker, r]));
  const cats = Object.fromEntries(D.categories.map((c) => [c.key, c]));
  const VERD = { strong: "Strong", steady: "Steady", choosy: "Choosy", strained: "Strained" };
  const VERD_NOTE = {
    strong: "broad demand, accelerating",
    steady: "healthy, little change",
    choosy: "spending, but picky and deal-driven",
    strained: "pulling back, stress showing",
  };
  const GUIDE = { raised: "Raised", maintained: "Held", lowered: "Cut", initiated: "Initiated", mixed: "Mixed", none: "—" };

  const hist = {};          // ticker -> reviewed/draft reports, newest first
  const pending = {};       // ticker -> newest pending stub (results filed, not yet summarised)
  for (const r of D.reports) {
    if (r.status === "pending") { if (!pending[r.ticker] || r.report_date > pending[r.ticker].report_date) pending[r.ticker] = r; continue; }
    (hist[r.ticker] = hist[r.ticker] || []).push(r);
  }
  Object.values(hist).forEach((a) => a.sort((p, q) => q.report_date.localeCompare(p.report_date)));
  const latest = D.retailers.map((r) => hist[r.ticker]?.[0]).filter(Boolean);
  let page = 0;  // index into PAGES

  // ---------- masthead + briefing
  function mast() {
    const newest = [...D.reports].sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    const next = Object.entries(D.calendar || {}).filter(([, c]) => c.date >= today).sort((a, b) => a[1].date.localeCompare(b[1].date))[0];
    return `<header class="wrap mast">
      <div><h1>Retail <span>Earnings</span> Monitor</h1>
      <p>Each quarterly report from the biggest U.S. retailers, read for what it says about the consumer and the economy: who is spending, on what, and how it is changing.</p></div>
      <div class="stamp">
        ${newest ? `Latest report <b>${esc(retailers[newest.ticker].name)}</b> · ${fmtDate(newest.report_date)}<br>` : ""}
        ${next ? `Next up <b>${esc(retailers[next[0]].name)}</b> · ${fmtDate(next[1].date)}${next[1].confirmed ? "" : " (est.)"}<br>` : ""}
        ${D.reports.length} reports · ${D.retailers.length} retailers · built ${fmtDate(D.built)}
      </div></header>`;
  }

  function briefing() {
    const b = D.briefing;
    const verdicts = latest.map((r) => r.consumer.verdict);
    const count = (v) => verdicts.filter((x) => x === v).length;
    const growthOnly = latest.filter((r) => retailers[r.ticker].comp_is_growth);
    const comps = latest.filter((r) => !retailers[r.ticker].comp_is_growth).map((r) => r.metrics.comp_pct);
    const withEst = latest.filter((r) => isNum(r.eps_surprise_pct));
    const beatRs = withEst.filter((r) => r.eps_surprise_pct > 0);
    const beats = beatRs.length;
    const murky = beatRs.filter((r) => r.one_offs_undisclosed).length;
    const raised = latest.filter((r) => r.guidance === "raised").length;
    const cut = latest.filter((r) => r.guidance === "lowered").length;
    const moves = latest.map((r) => r.metrics.stock_reaction_pct).filter(isNum);
    const enoughMoves = moves.length >= Math.ceil(latest.length / 2);

    const mix = D.verdicts.filter(count).map((v) =>
      `<div class="${v}" style="flex:${count(v)}" title="${VERD[v]}: ${count(v)}">${count(v)}</div>`).join("");
    const key = D.verdicts.map((v) => `<span><i style="background:var(--${v})"></i>${VERD[v]} ${count(v)}</span>`).join("");

    const tally = {};
    latest.forEach((r) => (r.themes || []).forEach((t) => (tally[t] = (tally[t] || 0) + 1)));
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const themeRows = top.map(([t, n]) => `<div class="theme"><span class="lab" title="${esc(D.themes[t])}">${esc(D.themes[t])}</span>
      <span class="track"><span class="fill" style="width:${(n / latest.length) * 100}%"></span></span><span class="n">${n}</span></div>`).join("");

    const points = (b?.points || []).map((p) => `<li><b>${esc(p.title)}</b><p>${esc(p.body)}</p></li>`).join("");

    return `<section class="wrap brief" aria-label="Briefing">
      <div class="verdict">
        <div class="eyebrow">The read on the consumer${b?.as_of ? ` · as of ${fmtDate(b.as_of)}` : ""}</div>
        <h2>${esc(b?.headline || "Latest reports by retailer")}</h2>
        ${b?.summary ? `<p class="sum">${esc(b.summary)}</p>` : ""}
        ${points ? `<ul class="points">${points}</ul>` : ""}
        ${b?.auto ? `<div class="autonote">Briefing drafted automatically from the latest reports.</div>` : ""}
      </div>
      <div class="pulse">
        <div>
          <div class="eyebrow">Consumer pulse · latest report from each retailer</div>
          <div class="mix" role="img" aria-label="${D.verdicts.map((v) => `${VERD[v]} ${count(v)}`).join(", ")}" style="margin-top:8px">${mix}</div>
          <div class="mixkey">${key}</div>
        </div>
        <div class="tiles">
          <div class="tile"><div class="k">Median comp sales</div><div class="v">${pct(median(comps))}</div><div class="s">across ${comps.filter(isNum).length} retailers${growthOnly.length ? `; ${growthOnly.map((r) => retailers[r.ticker].name).join(", ")} left out (growth, not a comp)` : ""}</div></div>
          <div class="tile"><div class="k">Beat EPS estimates</div><div class="v">${beats}/${withEst.length}</div><div class="s">one-time items removed where disclosed${murky ? `; ${murky} of the beats include tariff refunds of undisclosed size` : ""}</div></div>
          <div class="tile"><div class="k">Guidance</div><div class="v">${raised}<span style="font-size:15px;color:var(--muted)"> up</span> ${cut}<span style="font-size:15px;color:var(--muted)"> down</span></div><div class="s">${latest.length - raised - cut} held, mixed or none</div></div>
          <div class="tile"><div class="k">Median stock reaction</div><div class="v ${enoughMoves ? cls(median(moves)) : ""}">${enoughMoves ? pct(median(moves)) : "—"}</div><div class="s">${enoughMoves ? `on report day, ${moves.length} of ${latest.length} retailers` : `only ${moves.length} of ${latest.length} retailers have a confirmed move`}</div></div>
        </div>
        <div>
          <div class="eyebrow" style="margin-bottom:8px">What management keeps talking about · retailers citing it</div>
          <div class="themes">${themeRows}</div>
        </div>
      </div>
    </section>`;
  }

  // ---------- page strip (sticky): one tab per page, plus previous / next
  function nav() {
    return `<nav class="bar" aria-label="Pages"><div class="wrap">
      <div class="tabs">${PAGES.map((pg, i) => `<a href="#${pg.key}" data-page="${i}"><span class="pn">${i + 1}</span>${esc(pg.short || pg.label)}</a>`).join("")}</div>
      <div class="arrows"><button type="button" data-step="-1" aria-label="Previous page">←</button><button type="button" data-step="1" aria-label="Next page">→</button></div>
    </div></nav>`;
  }

  // ---------- retailer cards
  function spark(reports) {
    const pts = reports.slice(0, 6).reverse().filter((r) => isNum(r.metrics.comp_pct));
    if (pts.length < 2) return "";
    const W = 320, H = 92, top = 16, bottom = 18, left = 4, right = 4;
    const vals = pts.map((r) => r.metrics.comp_pct);
    const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), span = hi - lo || 1;
    const y = (v) => top + ((hi - v) / span) * (H - top - bottom);
    const bw = (W - left - right) / pts.length;
    const bars = pts.map((r, i) => {
      const v = r.metrics.comp_pct, x = left + i * bw + bw * 0.2, w = bw * 0.6;
      const y0 = y(0), y1 = y(v), last = i === pts.length - 1;
      const yTop = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), 1.5);
      const rr = Math.min(4, w / 2, h);
      // 4px rounded data end, square at the baseline
      const path = v >= 0
        ? `M${x},${y0}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${y0}Z`
        : `M${x},${y0}V${yTop + h - rr}Q${x},${yTop + h} ${x + rr},${yTop + h}H${x + w - rr}Q${x + w},${yTop + h} ${x + w},${yTop + h - rr}V${y0}Z`;
      const tip = `${r.fiscal_period}\n${pct(v)} ${r.metrics.comp_label || ""}\nreported ${fmtDate(r.report_date)}`;
      return `<g data-tip="${esc(tip)}"><rect x="${left + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>
        <path d="${path}" fill="var(--bar)" opacity="${last ? 1 : 0.55}"/>
        ${last ? `<text class="lbl" x="${x + w / 2}" y="${v >= 0 ? yTop - 4 : yTop + h + 11}" text-anchor="middle">${pct(v)}</text>` : ""}
        <text x="${x + w / 2}" y="${H - 4}" text-anchor="middle">${esc(shortQ(r))}</text></g>`;
    }).join("");
    return `<div class="spark"><div class="spark-head"><span>Comp sales by calendar quarter</span><span>hover for detail</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparable sales, last ${pts.length} quarters: ${pts.map((r) => `${r.fiscal_period} ${pct(r.metrics.comp_pct)}`).join(", ")}">
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--rule)" stroke-width="1"/>${bars}</svg></div>`;
  }
  const shortQ = (r) => (r.cal_quarter ? r.cal_quarter.replace(/^\d{2}(\d{2}) (Q\d)$/, "$2 '$1") : r.fiscal_period);

  function kv(r) {
    const m = r.metrics;
    const base = isNum(m.eps_ex_one_offs) ? m.eps_ex_one_offs : m.eps_adj;
    const eps = isNum(base) ? `$${base.toFixed(2)}${r.one_offs_undisclosed ? "*" : ""}${isNum(m.eps_consensus) ? ` vs ${m.eps_consensus.toFixed(2)}` : ""}` : "—";
    const rows = [
      ["Revenue", isNum(m.revenue_bn) ? `$${m.revenue_bn.toFixed(1)}bn` : "—", ""],
      ["Rev. YoY", pct(m.revenue_yoy_pct), cls(m.revenue_yoy_pct)],
      ["Traffic", pct(m.traffic_pct), cls(m.traffic_pct)],
      ["Ticket", pct(m.ticket_pct), cls(m.ticket_pct)],
      ["Digital", pct(m.ecom_yoy_pct, 0), cls(m.ecom_yoy_pct)],
      ["Gross margin", isNum(m.gross_margin_bps) ? `${m.gross_margin_bps > 0 ? "+" : m.gross_margin_bps < 0 ? "−" : ""}${Math.abs(m.gross_margin_bps)}bp` : "—", cls(m.gross_margin_bps)],
      [isNum(m.eps_ex_one_offs) ? "EPS ex one-offs" : "EPS", eps, cls(r.eps_surprise_pct)],
      ...(isNum(m.eps_ex_one_offs) ? [["EPS reported", `$${m.eps_adj.toFixed(2)}`, ""]] : []),
      ["Guidance", GUIDE[r.guidance] || "—", r.guidance === "raised" ? "up" : r.guidance === "lowered" ? "dn" : ""],
      ["Stock, day", pct(m.stock_reaction_pct), cls(m.stock_reaction_pct)],
      ["Inventory", pct(m.inventory_yoy_pct), ""],
    ].filter(([, v]) => v !== "—");
    return rows.map(([k, v, c]) => `<div${k.startsWith("EPS") ? ' class="wide"' : ""}><span>${k}</span><b class="${c}">${esc(v)}</b></div>`).join("");
  }

  function card(t) {
    const rs = hist[t.ticker];
    const pend = pending[t.ticker];
    if (!rs) {
      return `<article class="rc"><div class="rc-top"><div class="rc-name"><h3>${esc(t.name)}</h3><span class="tk">${t.ticker}</span></div></div>
        <p class="autonote">No reports yet.</p></article>`;
    }
    const r = rs[0], c = r.consumer || {}, m = r.metrics;
    const newer = pend && pend.report_date > r.report_date;
    const consumerBits = [
      c.income_split && `<div><b>By income:</b> ${esc(c.income_split)}</div>`,
      c.big_ticket && `<div><b>Discretionary:</b> ${esc(c.big_ticket)}</div>`,
      c.pricing && `<div><b>Pricing:</b> ${esc(c.pricing)}</div>`,
    ].filter(Boolean).join("");
    const past = rs.slice(1).map((p) => `<div><div class="ph"><b>${esc(p.fiscal_period)}</b><span class="verd ${p.consumer.verdict}">${VERD[p.consumer.verdict]}</span>
      <span class="when">comp ${pct(p.metrics.comp_pct)} · ${fmtDate(p.report_date)}</span></div><p>${esc(p.headline)}</p>${p.notes?.length ? `<p class="pnote">Note: ${esc(p.notes.join(" "))}</p>` : ""}</div>`).join("");
    const srcs = (r.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join("");
    return `<article class="rc" id="r-${t.ticker}">
      <div class="rc-top">
        <div><div class="rc-name"><h3>${esc(t.name)}</h3><span class="tk">${t.ticker}</span></div>
        <div class="when">${esc(r.fiscal_period)} · reported ${fmtDate(r.report_date)}</div></div>
        <span class="verd ${c.verdict}" title="Consumer: ${VERD_NOTE[c.verdict]}">${VERD[c.verdict]}</span>
      </div>
      ${newer ? `<div><span class="badge">New results filed ${fmtDate(pend.report_date)} · summary pending</span>
        ${pend.sources?.[0] ? ` <a class="srcs" href="${esc(pend.sources[0].url)}" target="_blank" rel="noopener">filing</a>` : ""}</div>` : ""}
      ${r.status === "draft" ? `<div><span class="badge">Auto-drafted from the press release · not yet reviewed</span></div>` : ""}
      <p class="says">${esc(r.headline)}</p>
      <div class="strip">
        <div class="pricetag"><span class="v">${pct(m.comp_pct)}</span><span class="l">${esc(m.comp_label || t.comp_label)}</span></div>
        <div class="kv">${kv(r)}</div>
      </div>
      <ul class="msgs">${(r.key_messages || []).map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      ${consumerBits ? `<div class="consumer">${consumerBits}</div>` : ""}
      ${c.quote ? `<blockquote class="quote">“${esc(c.quote.replace(/^["“]|["”]$/g, ""))}”</blockquote>` : ""}
      ${spark(rs)}
      ${r.themes?.length ? `<div class="themes-row">${r.themes.map((th) => `<span class="pill">${esc(D.themes[th])}</span>`).join("")}</div>` : ""}
      ${r.macro_read ? `<div class="macro"><b>Economy</b>${esc(r.macro_read)}</div>` : ""}
      ${r.guidance_note ? `<div class="consumer"><div><b>Outlook:</b> ${esc(r.guidance_note)}</div></div>` : ""}
      ${r.notes?.length ? `<div class="dnotes"><b>Data notes</b><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
      ${past ? `<details class="hist"><summary>Earlier quarters (${rs.length - 1})</summary><div class="past">${past}</div></details>` : ""}
      ${srcs ? `<div class="srcs">Sources: ${srcs}</div>` : ""}
    </article>`;
  }

  function glance(ts) {
    return `<div class="glance">${ts.map((t) => {
      const r = hist[t.ticker]?.[0];
      if (!r) return "";
      return `<a class="g" href="#r-${t.ticker}"><span class="gn">${esc(t.name)}</span><span class="gv num">${pct(r.metrics.comp_pct)}${t.comp_is_growth ? "†" : ""}</span>
        <span class="verd ${r.consumer.verdict}">${VERD[r.consumer.verdict]}</span></a>`;
    }).join("")}</div>`;
  }
  function categoryPage(c) {
    const ts = D.retailers.filter((r) => r.category === c.key);
    return `<section class="wrap cat"><div class="cards">${ts.map(card).join("")}</div></section>`;
  }

  // ---------- comp heatmap: retailers x calendar quarter
  function heatmap() {
    const qs = [...new Set(D.reports.filter((r) => r.cal_quarter).map((r) => r.cal_quarter))].sort().slice(-6);
    const rows = D.retailers;
    const bucket = (v) => (v >= 5 ? "p3" : v >= 2 ? "p2" : v >= 0.5 ? "p1" : v > -0.5 ? "" : v > -2 ? "n1" : v > -5 ? "n2" : "n3");
    const lab = (q) => q.replace(/^(\d{4}) (Q\d)$/, "$2 $1");
    const body = rows.map((t) => {
      const cells = qs.map((q) => {
        const r = (hist[t.ticker] || []).find((x) => x.cal_quarter === q);
        if (!r || !isNum(r.metrics.comp_pct)) return `<td class="na">·</td>`;
        const v = r.metrics.comp_pct;
        const tip = `${t.name} ${r.fiscal_period}\n${pct(v)} ${r.metrics.comp_label || t.comp_label}\nconsumer: ${VERD[r.consumer.verdict]}`;
        const g = t.comp_is_growth;
        return `<td class="${bucket(v)}${g ? " growth" : ""}" data-tip="${esc(tip + (g ? "\ntotal growth, not a like-for-like comp" : ""))}" tabindex="0">${pct(v)}${g ? "†" : ""}</td>`;
      }).join("");
      return `<tr><th class="rowh" scope="row">${esc(t.name)}${t.comp_is_growth ? "†" : ""}<span>${t.ticker}</span></th>${cells}</tr>`;
    }).join("");
    const sw = [["n3", "≤ −5"], ["n2", "−5 to −2"], ["n1", "−2 to −0.5"], ["", "flat"], ["p1", "0.5 to 2"], ["p2", "2 to 5"], ["p3", "≥ 5"]];
    return `<section class="wrap sec heat-sec"><div class="sec-head"><div class="eyebrow">Comp sales, quarter by quarter</div>
      <p>Each retailer's headline comparable-sales growth, lined up by the calendar quarter it covers so different fiscal years compare. Blue is growth, red is decline. Hover a cell for the fiscal quarter. Each retailer defines comps a little differently, so treat small gaps as approximate.</p></div>
      <div class="panel scroll"><table class="heat"><thead><tr><th></th>${qs.map((q) => `<th scope="col">${lab(q)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
      <div class="scale">${sw.map(([c, l]) => `<span><i style="background:var(--div-${c ? (c[0] === "p" ? "pos-" : "neg-") + c[1] : "mid"})"></i> ${l}</span>`).join("")} <span>% comp</span></div>
      ${D.retailers.some((t) => t.comp_is_growth) ? `<div class="scale">† ${esc(D.retailers.filter((t) => t.comp_is_growth).map((t) => t.name).join(", "))}: total online-stores growth, not a like-for-like comp.</div>` : ""}</div></section>`;
  }

  // ---------- calendar
  function calendar() {
    const evs = Object.entries(D.calendar || {}).map(([tk, c]) => ({ tk, ...c })).filter((e) => retailers[e.tk])
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!evs.length) return "";
    return `<section class="wrap sec">
      <div class="cal">${evs.map((e) => {
        const [, m, d] = e.date.split("-").map(Number);
        return `<div class="ev ${e.date < today ? "past-ev" : ""}"><div class="date"><span>${MONTHS[m - 1]}</span><b>${d}</b></div>
        <div class="who">${esc(retailers[e.tk].name)} <span class="tk" style="font:12px var(--mono);color:var(--muted)">${e.tk}</span></div>
        <div class="what">${esc(e.label || "")}${e.confirmed
          ? `${e.time ? ` · ${esc(e.time)}` : ""} · <b class="conf">confirmed</b>`
          : ` · estimated${e.basis ? `<span class="basis">${esc(e.basis)}</span>` : ""}`}${e.date < today ? " · awaiting data" : ""}</div></div>`;
      }).join("")}</div></section>`;
  }

  function foot() {
    return `<section class="wrap foot">
      <p><b>How to read it.</b> Each card is the retailer's latest quarter. The yellow tag is its headline comparable-sales growth (stores open a year or more, plus digital where the company counts it). The consumer verdict is a judgement from what management said: <b>strong</b> (${VERD_NOTE.strong}), <b>steady</b> (${VERD_NOTE.steady}), <b>choosy</b> (${VERD_NOTE.choosy}), <b>strained</b> (${VERD_NOTE.strained}).</p>
      ${D.data_notes?.length ? `<dl class="datanotes">${D.data_notes.map((n) => `<dt>${esc(n.title)}</dt><dd>${esc(n.body)}</dd>`).join("")}</dl>` : ""}
    </section>`;
  }

  // ---------- pages
  const PAGES = [
    { key: "summary", label: "Executive summary", short: "Summary",
      lead: "What the latest reports say together, and every retailer's comps quarter by quarter.",
      body: () => briefing() + heatmap() },
    ...D.categories.map((c) => ({
      key: c.key, label: c.name, short: c.short, lead: c.reads,
      head: () => glance(D.retailers.filter((r) => r.category === c.key)),
      body: () => categoryPage(c),
    })),
    { key: "calendar", label: "Earnings calendar", short: "Calendar",
      lead: "Next scheduled reports. Dates marked estimated have not been confirmed by the company.",
      body: () => calendar() },
    { key: "notes", label: "Notes on the data", short: "Notes",
      lead: "How to read the dashboard, where the numbers come from, and what to keep in mind.",
      body: () => foot() },
  ];
  const indexOf = (key) => PAGES.findIndex((pg) => pg.key === key);

  function pager() {
    const prev = PAGES[page - 1], next = PAGES[page + 1];
    return `<nav class="wrap pager" aria-label="Previous and next page">
      ${prev ? `<a class="pg prev" href="#${prev.key}"><span>← Previous</span><b>${esc(prev.label)}</b></a>` : "<span></span>"}
      <span class="count num">${page + 1} / ${PAGES.length}</span>
      ${next ? `<a class="pg next" href="#${next.key}"><span>Next →</span><b>${esc(next.label)}</b></a>` : "<span></span>"}
    </nav>`;
  }

  function showPage(i, { scroll = true } = {}) {
    page = Math.max(0, Math.min(PAGES.length - 1, i));
    const pg = PAGES[page];
    const main = document.getElementById("page");
    main.innerHTML = `<header class="wrap page-head">
        <div class="eyebrow">Page ${page + 1} of ${PAGES.length}</div>
        <h2>${esc(pg.label)}</h2>${pg.lead ? `<p>${esc(pg.lead)}</p>` : ""}${pg.head ? pg.head() : ""}
      </header>${pg.body()}${pager()}`;
    main.classList.remove("enter"); void main.offsetWidth; main.classList.add("enter");
    document.querySelectorAll(".tabs a").forEach((a) => {
      const on = Number(a.dataset.page) === page;
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      if (on) a.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    document.querySelector('.arrows [data-step="-1"]').disabled = page === 0;
    document.querySelector('.arrows [data-step="1"]').disabled = page === PAGES.length - 1;
    document.title = page ? `${pg.label} · Retail Earnings Monitor` : "Retail Earnings Monitor";
    if (scroll) {
      const bar = document.querySelector(".bar");
      const top = page ? bar.offsetTop : 0;
      if (scrollY > top) window.scrollTo({ top });
    }
  }
  const go = (i) => {
    if (i < 0 || i >= PAGES.length || i === page) return;
    location.hash = PAGES[i].key;  // hashchange shows it, and Back flips back
  };

  app.innerHTML = mast() + nav() + `<main id="page"></main>`;
  showPage(Math.max(0, indexOf(location.hash.slice(1))), { scroll: false });
  window.addEventListener("hashchange", () => {
    const key = location.hash.slice(1);
    const i = indexOf(key);
    if (i >= 0) { showPage(i); return; }
    if (key.startsWith("r-")) {  // jump to a retailer card from the at-a-glance strip
      const el = document.getElementById(key);
      if (el) el.scrollIntoView({ block: "start" });
    }
  });

  app.addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (step) go(page + Number(step.dataset.step));
    const g = e.target.closest("a.g");
    if (g) { e.preventDefault(); document.querySelector(g.getAttribute("href"))?.scrollIntoView({ block: "start" }); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight") go(page + 1);
    if (e.key === "ArrowLeft") go(page - 1);
  });
  // swipe left / right to flip on touch screens (not when swiping inside a scrolling table)
  let touch = null;
  app.addEventListener("touchstart", (e) => {
    touch = e.target.closest(".scroll, .tabs") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  app.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) go(page + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // one floating tooltip for every [data-tip] mark
  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
  const show = (el) => {
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip; tip.hidden = false;
    tip.style.left = Math.min(Math.max(r.left + r.width / 2 + scrollX, 90), document.documentElement.clientWidth - 90 + scrollX) + "px";
    tip.style.top = r.top + scrollY + "px";
  };
  app.addEventListener("pointerover", (e) => { const el = e.target.closest("[data-tip]"); if (el) show(el); });
  app.addEventListener("pointerout", (e) => { if (e.target.closest("[data-tip]")) tip.hidden = true; });
  app.addEventListener("focusin", (e) => { const el = e.target.closest("[data-tip]"); if (el) show(el); });
  app.addEventListener("focusout", () => { tip.hidden = true; });
})();
