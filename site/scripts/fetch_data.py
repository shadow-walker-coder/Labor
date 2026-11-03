"""Download every card in series_config.py from FRED and write data/series.js.

Usage:
    python scripts/fetch_data.py
    FRED_API_KEY=... python scripts/fetch_data.py   # optional, uses the official API

With FRED_API_KEY set (free key: https://fred.stlouisfed.org/docs/api/api_key.html)
the script uses the FRED API. This is the reliable route, and the one GitHub Actions
needs. Without a key it tries FRED's public graph CSV endpoint, which works from a
personal machine but does not respond to requests from GitHub's runners.

Uses only the Python standard library. A series that fails to download is
logged and left empty (the page shows a placeholder) instead of stopping the run.
"""

import csv
import datetime as dt
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from series_config import (MODEL_INPUTS, MODEL_SPREAD, MODEL_START, MODEL_TARGET,  # noqa: E402
                           RECESSION_SERIES, SECTION_INTROS, SECTIONS, SERIES, START)
import nowcast  # noqa: E402

API = "https://api.stlouisfed.org/fred"
GRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
FREQ_NAMES = {"d": "Daily", "w": "Weekly", "m": "Monthly", "q": "Quarterly", "a": "Annual"}
OUT = Path(__file__).resolve().parent.parent / "data" / "series.js"
DROP = ("scale", "freq", "agg", "units", "start", "lines", "ratio", "id")


def fred(path, **params):
    params.update(api_key=os.environ["FRED_API_KEY"], file_type="json")
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def observations(series_id, start, units="lin", freq=None, agg=None):
    if not os.environ.get("FRED_API_KEY"):
        return csv_observations(series_id, start, units, freq, agg)
    params = dict(series_id=series_id, observation_start=start, units=units)
    if freq:
        params.update(frequency=freq, aggregation_method=agg or "avg")
    rows = fred("series/observations", **params)["observations"]
    return [(r["date"], None if r["value"] == "." else float(r["value"])) for r in rows]


def csv_observations(series_id, start, units="lin", freq=None, agg=None):
    params = dict(id=series_id, cosd=start, transformation=units)
    if freq:
        params.update(fq=FREQ_NAMES[freq], fam=agg or "avg")
    req = urllib.request.Request(f"{GRAPH_CSV}?{urllib.parse.urlencode(params)}",
                                 headers={"User-Agent": "macro-monitor-data-refresh"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        rows = list(csv.reader(io.StringIO(resp.read().decode("utf-8"))))
    out = []
    for date, value in (r[:2] for r in rows[1:] if len(r) >= 2):
        out.append((date, None if value in ("", ".") else float(value)))
    return [o for o in out if o[0] >= start]


FAILURES = {"in_a_row": 0}


def safe_observations(series_id, *args):
    if FAILURES["in_a_row"] >= 5:
        sys.exit("Five downloads in a row failed; FRED looks unreachable. Keeping the existing data.")
    try:
        obs = observations(series_id, *args)
        print(f"  {series_id}: {len(obs)} observations", flush=True)
        FAILURES["in_a_row"] = 0
        return obs
    except Exception as err:  # one bad series should not stop the refresh
        print(f"  WARNING {series_id}: {err}", flush=True)
        FAILURES["in_a_row"] += 1
        return []


def card_lines(cfg):
    """Return [(label, id, obs)] for one card."""
    args = (cfg.get("start", START), cfg.get("units", "lin"), cfg.get("freq"), cfg.get("agg"))
    if "ratio" in cfg:
        num_id, den_id = cfg["ratio"]
        den = dict(safe_observations(den_id, *args))
        obs = [(d, round(v / den[d], 4) if v is not None and den.get(d) else None)
               for d, v in safe_observations(num_id, *args) if d in den]
        return [(cfg["title"], num_id, obs), ("", den_id, None)]
    if "lines" in cfg:
        return [(ln["label"], ln["id"], safe_observations(ln["id"], *args)) for ln in cfg["lines"]]
    return [(cfg["title"], cfg["id"], safe_observations(cfg["id"], *args))]


def recession_ranges(start):
    ranges, begin, prev = [], None, None
    for date, flag in safe_observations(RECESSION_SERIES, start):
        if flag == 1 and begin is None:
            begin = date
        elif flag != 1 and begin is not None:
            ranges.append([begin, prev])
            begin = None
        prev = date
    if begin is not None:
        ranges.append([begin, prev])
    return ranges


def model_payload():
    """Download the GDP model's inputs and fit it. Returns None if anything is missing."""
    gdp = safe_observations(MODEL_TARGET, MODEL_START)
    inputs = [(sid, label, safe_observations(sid, MODEL_START)) for sid, label in MODEL_INPUTS]
    spread = safe_observations(MODEL_SPREAD, MODEL_START, "lin", "m", "avg")
    return nowcast.build(gdp, inputs, spread)


def build_payload(cards_with_lines, recessions, updated, model=None):
    """cards_with_lines: [(cfg, [(label, id, obs or None), ...])]. A line with obs None is a
    source only (the denominator of a ratio) and is listed but not drawn."""
    out = []
    for cfg, lines in cards_with_lines:
        scale = cfg.get("scale", 1)
        item = {k: v for k, v in cfg.items() if k not in DROP}
        item["key"] = cfg.get("key", cfg.get("id"))
        item["lines"] = [
            {"label": label, "id": sid,
             "obs": [[d, None if v is None else round(v / scale, 4)] for d, v in obs]}
            for label, sid, obs in lines if obs is not None
        ]
        item["sources"] = [sid for _, sid, _ in lines]
        out.append(item)
    return {"updated": updated, "sections": SECTIONS, "intros": SECTION_INTROS,
            "recessions": recessions, "series": out, "model": model}


def write(payload, path=OUT):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.MACRO_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"wrote {path} ({len(payload['series'])} cards)")


def main():
    print("Using the FRED API" if os.environ.get("FRED_API_KEY") else "No FRED_API_KEY set; using FRED graph CSVs")
    cards = [(cfg, card_lines(cfg)) for cfg in SERIES]
    filled = sum(any(obs for _, _, obs in lines) for _, lines in cards)
    print(f"{filled} of {len(cards)} cards have data")
    if filled < len(cards) / 2:
        # most downloads failed, so FRED is probably unreachable; keep the existing data
        sys.exit("Too many series failed; not overwriting data/series.js")
    write(build_payload(cards, recession_ranges(START), dt.date.today().isoformat(), model_payload()))


if __name__ == "__main__":
    main()
