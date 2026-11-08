"""Merge earnings research into earnings/data/earnings.js and write a small summary for the home page.

Usage:
    python scripts/build_earnings.py                    # just rebuild derived fields + summary
    python scripts/build_earnings.py new/*.json         # also merge research files

Each research file is {"companies": [...], "reports": [...], "calendar": {...}} in the same shape
as the entries already in earnings.js (see earnings/data/README in the repo for the fields). A report
replaces an existing one with the same ticker and period_end. Derived fields (EPS surprise, calendar
quarter, file path) are recomputed for every report.

Standard library only.
"""

import datetime as dt
import json
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
DATA = SITE / "earnings" / "data" / "earnings.js"
SUMMARY = SITE / "data" / "earnings_summary.js"
PREFIX = "window.RETAIL_DATA = "


def load():
    text = DATA.read_text().strip()
    return json.loads(text[len(PREFIX):].rstrip(";"))


def cal_quarter(period_end):
    """The calendar quarter a fiscal quarter mostly covers: step back ~6 weeks from its end."""
    d = dt.date.fromisoformat(period_end) - dt.timedelta(days=45)
    return f"{d.year} Q{(d.month - 1) // 3 + 1}"


def surprise(actual, consensus):
    if not isinstance(actual, (int, float)) or not isinstance(consensus, (int, float)) or not consensus:
        return None
    return round((actual - consensus) / abs(consensus) * 100, 1)


def derive(r):
    m = r.setdefault("metrics", {})
    base = m.get("eps_ex_one_offs") if isinstance(m.get("eps_ex_one_offs"), (int, float)) else m.get("eps_adj")
    r["eps_surprise_pct"] = surprise(base, m.get("eps_consensus"))
    r["rev_surprise_pct"] = surprise(m.get("revenue_bn"), m.get("revenue_consensus_bn"))
    if not r.get("cal_quarter"):
        r["cal_quarter"] = cal_quarter(r["period_end"])  # keep hand-set alignments (Costco, Kroger)
    r["file"] = f"reports/{r['ticker']}/{r['period_end']}.json"
    r.setdefault("status", "reviewed")
    r.setdefault("one_offs_undisclosed", False)
    r.setdefault("notes", [])
    r.setdefault("sources", [])
    return r


def merge(d, extra):
    known = {c["ticker"] for c in d["retailers"]}
    for c in extra.get("companies", []):
        if c["ticker"] not in known:
            d["retailers"].append(c)
            known.add(c["ticker"])
    keyed = {(r["ticker"], r["period_end"]): i for i, r in enumerate(d["reports"])}
    for r in extra.get("reports", []):
        k = (r["ticker"], r["period_end"])
        if k in keyed:
            d["reports"][keyed[k]] = r
        else:
            keyed[k] = len(d["reports"])
            d["reports"].append(r)
    d.setdefault("calendar", {}).update(extra.get("calendar", {}))


def summary(d):
    b = d.get("briefing") or {}
    return {"as_of": b.get("as_of"), "verdict": b.get("verdict"), "headline": b.get("headline"),
            "summary": b.get("summary"), "companies": len(d["retailers"]), "reports": len(d["reports"]),
            "sectors": [c["short"] for c in d["categories"]]}


def main(paths):
    d = load()
    for p in paths:
        merge(d, json.loads(Path(p).read_text()))
    d["reports"] = [derive(r) for r in d["reports"]]
    order = {c["key"]: i for i, c in enumerate(d["categories"])}
    d["retailers"].sort(key=lambda t: order.get(t["category"], 99))
    DATA.write_text(PREFIX + json.dumps(d, separators=(",", ":"), ensure_ascii=False) + ";\n")
    SUMMARY.write_text("window.EARNINGS_SUMMARY = " + json.dumps(summary(d), ensure_ascii=False) + ";\n")
    print(f"{len(d['retailers'])} companies, {len(d['reports'])} reports")


if __name__ == "__main__":
    main(sys.argv[1:])
