"""Watch SEC EDGAR for new retailer earnings and draft a report for each one.

Every listed retailer files an 8-K with Item 2.02 ("Results of Operations") on earnings
day, with the press release attached as Exhibit 99.1. For each retailer this script:

1. reads the company's filing list from data.sec.gov,
2. finds Item 2.02 8-Ks filed after the newest report already in retail/reports/<TICKER>/,
3. downloads the press release, and
4. if ANTHROPIC_API_KEY is set, asks Claude to draft the report in the dashboard's schema
   (status "draft": shown with an "auto-drafted" badge until a person reviews it and
   deletes the status line); without a key it writes a "pending" stub that links the filing.

With --brief, it also rewrites retail/data/briefing.json from each retailer's latest report
whenever a new report was drafted (or always, with --brief --force).

Run:  SEC_USER_AGENT="Your Name you@example.com" python retail/scripts/watch.py --brief
SEC asks every automated client to identify itself with a name and contact email.
Needs `pip install anthropic` only for drafting.
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CATEGORIES, GUIDANCE, RETAILERS, THEMES, VERDICTS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
DATA = ROOT / "data"
MODEL = "claude-opus-5-5"
MAX_RELEASE_CHARS = 400_000  # a long release is ~100k chars; this only guards against junk


# ---------------------------------------------------------------- SEC EDGAR

def sec_get(url: str) -> bytes:
    agent = os.environ.get("SEC_USER_AGENT")
    if not agent:
        print("::warning::SEC_USER_AGENT is not set. Set it to 'Your Name your@email' (SEC requires it); skipping the check.")
        sys.exit(0)
    req = urllib.request.Request(url, headers={"User-Agent": agent, "Accept-Encoding": "identity"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
            time.sleep(0.2)  # SEC fair-access limit is 10 requests per second
            return body
        except Exception as exc:  # noqa: BLE001 - retry any network failure
            if attempt == 3:
                raise
            print(f"  retry {url}: {exc}")
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError("unreachable")


def earnings_filings(cik: int, since: str):
    """Item 2.02 8-Ks filed after `since` (YYYY-MM-DD), oldest first."""
    sub = json.loads(sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
    recent = sub["filings"]["recent"]
    rows = []
    for i, form in enumerate(recent["form"]):
        if form != "8-K" or "2.02" not in (recent["items"][i] or ""):
            continue
        if recent["filingDate"][i] <= since:
            continue
        rows.append(dict(accession=recent["accessionNumber"][i], filed=recent["filingDate"][i],
                         primary=recent["primaryDocument"][i]))
    return sorted(rows, key=lambda r: r["filed"])


def press_release(cik: int, accession: str):
    """Return (text, url) of the Exhibit 99.1 press release in a filing."""
    folder = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}"
    listing = json.loads(sec_get(f"{folder}/index.json"))
    names = [item["name"] for item in listing["directory"]["item"]]
    exhibits = [n for n in names if re.search(r"ex-?99(\.|_)?0?1|ex991|dex991", n, re.I) and n.endswith((".htm", ".html", ".txt"))]
    if not exhibits:
        exhibits = [n for n in names if re.search(r"ex-?99", n, re.I) and n.endswith((".htm", ".html", ".txt"))]
    if not exhibits:
        return None, folder
    url = f"{folder}/{exhibits[0]}"
    raw = sec_get(url).decode("utf-8", "replace")
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return text[:MAX_RELEASE_CHARS], url


# ---------------------------------------------------------------- Claude

NUM = {"anyOf": [{"type": "number"}, {"type": "null"}]}
STR = {"anyOf": [{"type": "string"}, {"type": "null"}]}

REPORT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["fiscal_period", "period_end", "headline", "metrics", "guidance", "guidance_note",
                 "key_messages", "consumer", "themes", "macro_read", "one_offs_undisclosed", "notes"],
    "properties": {
        "fiscal_period": {"type": "string"},
        "period_end": {"type": "string", "description": "YYYY-MM-DD, last day of the fiscal quarter"},
        "headline": {"type": "string"},
        "metrics": {
            "type": "object",
            "additionalProperties": False,
            "required": ["revenue_bn", "revenue_yoy_pct", "comp_pct", "comp_label", "traffic_pct", "ticket_pct",
                         "ecom_yoy_pct", "gross_margin_bps", "eps_adj", "eps_ex_one_offs", "inventory_yoy_pct"],
            "properties": {
                "revenue_bn": NUM, "revenue_yoy_pct": NUM, "comp_pct": NUM, "comp_label": STR,
                "traffic_pct": NUM, "ticket_pct": NUM, "ecom_yoy_pct": NUM, "gross_margin_bps": NUM,
                "eps_adj": NUM, "eps_ex_one_offs": NUM, "inventory_yoy_pct": NUM,
            },
        },
        "guidance": {"type": "string", "enum": GUIDANCE},
        "guidance_note": STR,
        "key_messages": {"type": "array", "items": {"type": "string"}},
        "consumer": {
            "type": "object",
            "additionalProperties": False,
            "required": ["verdict", "income_split", "big_ticket", "pricing", "quote"],
            "properties": {
                "verdict": {"type": "string", "enum": VERDICTS},
                "income_split": STR, "big_ticket": STR, "pricing": STR, "quote": STR,
            },
        },
        "themes": {"type": "array", "items": {"type": "string", "enum": list(THEMES)}},
        "macro_read": {"type": "string"},
        "one_offs_undisclosed": {"type": "boolean"},
        "notes": {"type": "array", "items": {"type": "string"}},
    },
}

DRAFT_SYSTEM = f"""You turn a U.S. retailer's quarterly earnings press release into one record for a
dashboard that economists use to judge the health of the U.S. consumer and economy.

Rules:
- Use only what the release says. Any metric it does not state is null. Percent fields are plain
  numbers (2.6 means +2.6%). gross_margin_bps is the year-over-year change in basis points.
- comp_pct is the headline comparable-sales figure for the main U.S. business, with comp_label
  saying exactly what it measures. For Amazon use online stores growth and ignore AWS.
- headline: one plain-English sentence, at most 140 characters, on what the quarter says.
- key_messages: 3 to 5 bullets, each at most 160 characters, the points an economist should take away.
- consumer.verdict: strong (broad, accelerating demand), steady (healthy, little change),
  choosy (spending, but trading down, deal-driven or discretionary soft), strained (pulling back,
  lower-income stress, falling traffic).
- consumer.quote: a short verbatim quote from management about the customer, or null.
- themes: only tags the release clearly supports. Vocabulary: {json.dumps(THEMES)}
- guidance: compare with the outlook the company gave before (the previous record shows it).
- macro_read: one or two sentences on what the quarter implies for the U.S. economy.
- eps_adj is the company's adjusted EPS (GAAP if it gives none). If it includes one-time items whose
  per-share effect the release states (tariff refunds, tax benefits, investment gains), put EPS without
  them in eps_ex_one_offs; otherwise null. Set one_offs_undisclosed to true when such items are mentioned
  but their per-share effect is not given.
- notes: short caveats a reader needs to compare this quarter fairly (one-time items, calendar shifts,
  changed definitions, acquisitions). Empty if none."""


def claude_json(system: str, user: str, schema: dict, effort: str = "high") -> dict:
    import anthropic  # imported here so the SEC check runs without the SDK installed

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",  # if the model declines, the API reroutes to a fallback model
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined: {response.stop_details}")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude's answer was cut off at max_tokens")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def draft_report(retailer: dict, filing: dict, release: str, url: str, previous: dict | None) -> dict:
    user = (
        f"Retailer: {retailer['name']} ({retailer['ticker']}). Usual comp measure: {retailer['comp_label']}.\n"
        f"Results released: {filing['filed']}.\n\n"
        f"Previous quarter's record, for context and guidance comparison:\n"
        f"{json.dumps(previous, indent=1) if previous else 'none'}\n\n"
        f"<press_release>\n{release}\n</press_release>"
    )
    record = claude_json(DRAFT_SYSTEM, user, REPORT_SCHEMA)
    metrics = record["metrics"]
    metrics.update(revenue_consensus_bn=None, eps_consensus=None, stock_reaction_pct=None)
    return {
        "ticker": retailer["ticker"],
        "status": "draft",
        "accession": filing["accession"],
        "fiscal_period": record["fiscal_period"],
        "period_end": record["period_end"],
        "report_date": filing["filed"],
        "headline": record["headline"],
        "metrics": metrics,
        "guidance": record["guidance"],
        "guidance_note": record["guidance_note"],
        "key_messages": record["key_messages"],
        "consumer": record["consumer"],
        "themes": record["themes"],
        "macro_read": record["macro_read"],
        "one_offs_undisclosed": record["one_offs_undisclosed"],
        "notes": record["notes"],
        "sources": [{"label": "SEC filing: Exhibit 99.1 press release", "url": url}],
    }


ITEM = {
    "type": "object", "additionalProperties": False, "required": ["title", "body"],
    "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
}
BRIEF_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["verdict", "headline", "summary", "segments", "working", "pressure", "watch"],
    "properties": {
        "verdict": {"type": "string", "enum": VERDICTS},
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "segments": {
            "type": "object", "additionalProperties": False,
            "required": [c["key"] for c in CATEGORIES],
            "properties": {c["key"]: {"type": "string"} for c in CATEGORIES},
        },
        "working": {"type": "array", "items": ITEM},
        "pressure": {"type": "array", "items": ITEM},
        "watch": {"type": "array", "items": ITEM},
    },
}

BRIEF_SYSTEM = """You write the executive summary at the top of a dashboard tracking big U.S. retailer earnings,
for senior readers who want the conclusion first. From each retailer's latest quarterly record, say what the
reports together say about the U.S. consumer and economy.
- verdict: the overall consumer reading (strong, steady, choosy, strained).
- headline: one sentence, at most 90 characters, the verdict on the consumer.
- summary: two sentences at most.
- segments: one line per category key, at most 120 characters, the read for that segment with its key number.
- working, pressure, watch: 2 or 3 items each (what is going well, where it is weak, what to watch next).
  Each title at most 40 characters, each body at most 140 characters.
Cite numbers from the records only. Write plainly; no hype."""


def write_briefing():
    latest = {}
    for path in REPORTS.glob("*/*.json"):
        r = json.loads(path.read_text())
        if r.get("status") == "pending":
            continue
        if r["ticker"] not in latest or r["report_date"] > latest[r["ticker"]]["report_date"]:
            latest[r["ticker"]] = r
    names = {r["ticker"]: (r["name"], r["category"]) for r in RETAILERS}
    cats = {c["key"]: c["name"] for c in CATEGORIES}
    lines = [json.dumps({"retailer": names[t][0], "category_key": names[t][1], "category": cats[names[t][1]], **r}, ensure_ascii=False)
             for t, r in sorted(latest.items())]
    brief = claude_json(BRIEF_SYSTEM, "Latest record per retailer, one per line:\n" + "\n".join(lines), BRIEF_SCHEMA)
    brief["as_of"] = dt.date.today().isoformat()
    brief["auto"] = True
    (DATA / "briefing.json").write_text(json.dumps(brief, indent=2, ensure_ascii=False) + "\n")
    print("Rewrote briefing.json")


# ---------------------------------------------------------------- main

def existing(ticker: str):
    rows = [json.loads(p.read_text()) for p in (REPORTS / ticker).glob("*.json")]
    return sorted(rows, key=lambda r: r["report_date"])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--brief", action="store_true", help="rewrite briefing.json after new drafts")
    ap.add_argument("--force", action="store_true", help="with --brief, rewrite it even if nothing is new")
    ap.add_argument("--only", help="comma-separated tickers to check")
    args = ap.parse_args()

    can_draft = bool(os.environ.get("ANTHROPIC_API_KEY"))
    only = set(args.only.upper().split(",")) if args.only else None
    new = 0
    for retailer in RETAILERS:
        if only and retailer["ticker"] not in only:
            continue
        if not retailer.get("cik"):
            print(f"{retailer['ticker']}: not an SEC filer; update its reports by hand")
            continue
        have = existing(retailer["ticker"])
        done = [r for r in have if r.get("status") != "pending"]
        # with a key, pending stubs get redrafted; without one, they count as handled
        seen = {r.get("accession") for r in (done if can_draft else have)}
        since = done[-1]["report_date"] if done else (dt.date.today() - dt.timedelta(days=100)).isoformat()
        try:
            filings = [f for f in earnings_filings(retailer["cik"], since) if f["accession"] not in seen]
        except Exception as exc:  # noqa: BLE001 - one bad company should not stop the run
            print(f"{retailer['ticker']}: could not read EDGAR ({exc})")
            continue
        if not filings:
            print(f"{retailer['ticker']}: nothing new since {since}")
            continue
        for filing in filings:
            print(f"{retailer['ticker']}: new earnings filing {filing['accession']} ({filing['filed']})")
            release, url = press_release(retailer["cik"], filing["accession"])
            out_dir = REPORTS / retailer["ticker"]
            out_dir.mkdir(parents=True, exist_ok=True)
            if can_draft and release:
                record = draft_report(retailer, filing, release, url, done[-1] if done else None)
                path = out_dir / f"{record['period_end']}.json"
                (out_dir / f"pending-{filing['filed']}.json").unlink(missing_ok=True)
                done.append(record)
            else:
                record = {
                    "ticker": retailer["ticker"], "status": "pending", "accession": filing["accession"],
                    "fiscal_period": "New quarter", "report_date": filing["filed"],
                    "headline": "Results are out; the summary has not been written yet.",
                    "metrics": {}, "key_messages": [], "consumer": {}, "themes": [],
                    "sources": [{"label": "SEC filing", "url": url}],
                }
                path = out_dir / f"pending-{filing['filed']}.json"
            path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
            have.append(record)
            new += 1
            print(f"  wrote {path.relative_to(ROOT.parent)} ({record['status']})")

    if args.brief and can_draft and (new or args.force):
        write_briefing()
    print(f"{new} new report(s).")


if __name__ == "__main__":
    main()
