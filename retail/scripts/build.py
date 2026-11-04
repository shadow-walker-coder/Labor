"""Compile every earnings report into the data file the dashboard reads.

Reads   retail/reports/<TICKER>/<period_end>.json   one file per quarterly release
        retail/data/calendar.json                   next report date per ticker
        retail/data/briefing.json                   the cross-retailer briefing at the top
        retail/data/notes.json                      caveats shown under "Notes on the data"
Writes  retail/data/earnings.js                     window.RETAIL_DATA = {...}

Run: python retail/scripts/build.py   (stdlib only; fails on schema errors)
"""
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CATEGORIES, GUIDANCE, RETAILERS, THEMES, VERDICTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
DATA = ROOT / "data"

METRIC_KEYS = [
    "revenue_bn", "revenue_yoy_pct", "revenue_consensus_bn", "comp_pct", "comp_label",
    "traffic_pct", "ticket_pct", "ecom_yoy_pct", "gross_margin_bps", "eps_adj",
    "eps_consensus", "eps_ex_one_offs", "inventory_yoy_pct", "stock_reaction_pct",
]


def assign_calendar_quarters(reports: list[dict]) -> None:
    """Label each fiscal quarter with the calendar quarter it mostly covers.

    Retail fiscal years end in late January, so Walmart's 'Q2 FY2027' and Target's
    'Q2 2026' both cover roughly May-July and both become '2026 Q2'. The anchor is a
    point 55% of the way back through the quarter (length taken from the previous
    period end, else 13 weeks). Costco and Kroger run 12- and 16-week quarters that drift
    against the calendar; when two of a company's quarters land in the same slot, the
    later one moves to the next quarter so every column holds one report.
    """
    by_ticker: dict[str, list[dict]] = {}
    for r in reports:
        if r.get("period_end"):
            by_ticker.setdefault(r["ticker"], []).append(r)
    for rows in by_ticker.values():
        rows.sort(key=lambda r: r["period_end"])
        prev_end, prev_slot = None, None
        for r in rows:
            end = dt.date.fromisoformat(r["period_end"])
            days = (end - prev_end).days if prev_end else 91
            anchor = end - dt.timedelta(days=round(days * 0.55))
            slot = anchor.year * 4 + (anchor.month - 1) // 3
            if prev_slot is not None and slot <= prev_slot:
                slot = prev_slot + 1
            r["cal_quarter"] = f"{slot // 4} Q{slot % 4 + 1}"
            prev_end, prev_slot = end, slot


def check(report: dict, path: Path) -> list[str]:
    errs = []
    for key in ("ticker", "fiscal_period", "report_date", "headline", "metrics", "key_messages", "consumer"):
        if key not in report:
            errs.append(f"missing '{key}'")
    if report.get("status") == "pending":   # stub from watch.py with no summary yet
        return errs
    if "period_end" not in report:
        errs.append("missing 'period_end'")
    verdict = (report.get("consumer") or {}).get("verdict")
    if verdict not in VERDICTS:
        errs.append(f"consumer.verdict '{verdict}' not in {VERDICTS}")
    if report.get("guidance") not in GUIDANCE:
        errs.append(f"guidance '{report.get('guidance')}' not in {GUIDANCE}")
    bad = [t for t in report.get("themes", []) if t not in THEMES]
    if bad:
        errs.append(f"unknown themes {bad}")
    return [f"{path.relative_to(ROOT)}: {e}" for e in errs]


def load_reports():
    tickers = {r["ticker"] for r in RETAILERS}
    reports, errors = [], []
    for path in sorted(REPORTS.glob("*/*.json")):
        report = json.loads(path.read_text())
        errors += check(report, path)
        if report.get("ticker") not in tickers:
            errors.append(f"{path}: ticker not in config.RETAILERS")
            continue
        metrics = report.setdefault("metrics", {})
        for key in METRIC_KEYS:
            metrics.setdefault(key, None)
        # measure the beat on EPS without one-time items (e.g. tariff refunds) when disclosed
        eps = metrics.get("eps_ex_one_offs") if metrics.get("eps_ex_one_offs") is not None else metrics.get("eps_adj")
        est = metrics.get("eps_consensus")
        report["eps_surprise_pct"] = round((eps - est) / abs(est) * 100, 1) if eps is not None and est else None
        rev, rest = metrics.get("revenue_bn"), metrics.get("revenue_consensus_bn")
        report["rev_surprise_pct"] = round((rev - rest) / rest * 100, 1) if rev is not None and rest else None
        report.setdefault("status", "reviewed")
        report.setdefault("notes", [])
        report.setdefault("one_offs_undisclosed", False)
        report["file"] = str(path.relative_to(ROOT))
        reports.append(report)
    return reports, errors


def main():
    reports, errors = load_reports()
    assign_calendar_quarters(reports)
    if errors:
        print("Schema errors:\n  " + "\n  ".join(errors), file=sys.stderr)
        sys.exit(1)
    reports.sort(key=lambda r: (r["ticker"], r["report_date"]), reverse=False)

    def read(name, default):
        p = DATA / name
        return json.loads(p.read_text()) if p.exists() else default

    payload = dict(
        built=dt.date.today().isoformat(),
        categories=CATEGORIES,
        retailers=RETAILERS,
        themes=THEMES,
        verdicts=VERDICTS,
        reports=reports,
        calendar=read("calendar.json", {}),
        data_notes=read("notes.json", []),
        briefing=read("briefing.json", None),
    )
    out = DATA / "earnings.js"
    out.write_text("window.RETAIL_DATA = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n")
    by = {}
    for r in reports:
        by[r["ticker"]] = by.get(r["ticker"], 0) + 1
    print(f"Wrote {out.relative_to(ROOT.parent)}: {len(reports)} reports " +
          ", ".join(f"{t}={n}" for t, n in sorted(by.items())))


if __name__ == "__main__":
    main()
