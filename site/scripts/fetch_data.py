"""Download every card in series_config.py from FRED and write data/series.js.

Usage:
    export FRED_API_KEY=...   # free key: https://fred.stlouisfed.org/docs/api/api_key.html
    python scripts/fetch_data.py

Uses only the Python standard library. A series that fails to download is
logged and left empty (the page shows a placeholder) instead of stopping the run.
"""

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from series_config import RECESSION_SERIES, SECTION_INTROS, SECTIONS, SERIES, START  # noqa: E402

API = "https://api.stlouisfed.org/fred"
OUT = Path(__file__).resolve().parent.parent / "data" / "series.js"
DROP = ("scale", "freq", "agg", "units", "start", "lines", "ratio", "id")


def fred(path, **params):
    params.update(api_key=os.environ["FRED_API_KEY"], file_type="json")
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def observations(series_id, start, units="lin", freq=None, agg=None):
    params = dict(series_id=series_id, observation_start=start, units=units)
    if freq:
        params.update(frequency=freq, aggregation_method=agg or "avg")
    rows = fred("series/observations", **params)["observations"]
    return [(r["date"], None if r["value"] == "." else float(r["value"])) for r in rows]


def safe_observations(series_id, *args):
    try:
        obs = observations(series_id, *args)
        print(f"  {series_id}: {len(obs)} observations")
        return obs
    except (urllib.error.URLError, KeyError, ValueError) as err:
        print(f"  WARNING {series_id}: {err}")
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


def build_payload(cards_with_lines, recessions, updated):
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
            "recessions": recessions, "series": out}


def write(payload, path=OUT):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.MACRO_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"wrote {path} ({len(payload['series'])} cards)")


def main():
    if not os.environ.get("FRED_API_KEY"):
        sys.exit("Set FRED_API_KEY first.")
    cards = [(cfg, card_lines(cfg)) for cfg in SERIES]
    write(build_payload(cards, recession_ranges(START), dt.date.today().isoformat()))


if __name__ == "__main__":
    main()
