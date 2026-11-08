"""Collect the latest economy headlines from free RSS feeds and write data/news.js.

Usage:
    python scripts/fetch_news.py

Each item keeps the outlet, headline, publication time, the feed's own short summary
and a link to the original. Items are filtered to topics that matter for the U.S.
economy and consumer, de-duplicated across outlets, tagged by topic and ranked.
Feeds are the same free, keyless ones the CPoV Daily News tool uses.

Standard library only. A feed that fails is skipped; if every feed fails, the
existing data/news.js is kept.
"""

import datetime as dt
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "news.js"
UA = "MacroMonitor/1.0 (economic dashboard; https://github.com/shadow-walker-coder/Labor)"
DAYS = 3          # news window
RESEARCH_DAYS = 10  # research and Fed blogs publish less often
KEEP = 40

# (outlet, url, tier). Tier sets the dedup priority and how research is windowed.
FEEDS = [
    ("The Wall Street Journal", "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed", "premium"),
    ("The Wall Street Journal", "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", "premium"),
    ("The Wall Street Journal", "https://feeds.content.dowjones.io/public/rss/RSSWSJD", "premium"),
    ("The Wall Street Journal", "https://feeds.content.dowjones.io/public/rss/RSSPersonalFinance", "premium"),
    ("The Wall Street Journal", "https://feeds.content.dowjones.io/public/rss/RSSRealEstate", "premium"),
    ("Financial Times", "https://www.ft.com/world/us?format=rss", "premium"),
    ("Financial Times", "https://www.ft.com/global-economy?format=rss", "premium"),
    ("Financial Times", "https://www.ft.com/markets?format=rss", "premium"),
    ("The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml", "premium"),
    ("The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", "premium"),
    ("The Economist", "https://www.economist.com/finance-and-economics/rss.xml", "premium"),
    ("The Washington Post", "https://feeds.washingtonpost.com/rss/business", "premium"),
    ("American Banker", "https://www.americanbanker.com/feed", "standard"),
    ("Banking Dive", "https://www.bankingdive.com/feeds/news/", "standard"),
    ("HousingWire", "https://www.housingwire.com/feed/", "standard"),
    ("NY Fed Liberty Street Economics", "https://libertystreeteconomics.newyorkfed.org/feed/", "research"),
    ("St. Louis Fed", "https://www.stlouisfed.org/on-the-economy/rss", "research"),
    ("Calculated Risk", "https://www.calculatedriskblog.com/feeds/posts/default", "research"),
    ("Congressional Budget Office", "https://www.cbo.gov/publications/all/rss.xml", "research"),
    ("The Budget Lab at Yale", "https://budgetlab.yale.edu/rss.xml", "research"),
]
PRIORITY = {"The Wall Street Journal": 0, "Financial Times": 1, "The New York Times": 2}

# Topic tags, matched on headline + summary. The tag order is the display order.
TOPICS = [
    ("Fed & rates", r"\bfed\b|federal reserve|fomc|interest rates?|rate (cut|hike|increase)s?|treasury yields?|bond yields?|borrowing costs"),
    ("Inflation", r"inflation|consumer prices?|\bcpi\b|\bpce\b|price (increases|pressures)|cost of living|affordability"),
    ("Jobs", r"\bjobs report|payrolls?|unemployment|jobless|hiring|layoffs?|labor market|job market|wage growth|\bwages\b"),
    ("Growth", r"\bgdp\b|recession|economic growth|the economy|economists?|soft landing"),
    ("Consumer", r"consumer spending|consumers|retail sales|shoppers|household (debt|finances|spending|income)|savings rate|credit card|delinquen|buy now,? pay later|\bbnpl\b"),
    ("Housing", r"housing|mortgage|home ?(sales|prices|builders?|buyers?|values)|homebuy|rental market|real estate"),
    ("Energy", r"\boil prices?|\bcrude\b|gasoline|gas prices|\bopec\b|natural gas|\blng\b|energy prices"),
    ("Trade & tariffs", r"tariffs?|trade (war|deal|deficit|policy|talks)|supply chains?"),
    ("Budget & taxes", r"budget deficit|federal debt|national debt|tax (cuts?|bill|law|refunds?)|government shutdown|debt ceiling"),
    ("Markets", r"stock market|s&p 500|nasdaq|wall street|bond market|stocks (fell|rose|rallied|slid)|sell-?off"),
    ("Banks & credit", r"\bbanks?\b|lenders?|private credit|defaults?|bankruptc|\bfdic\b|\bcfpb\b"),
    ("AI & tech", r"artificial intelligence|\bai\b (spending|investment|boom|bubble|jobs)|data centers?"),
]
# At least one of these must match for an item to count as economy news.
CORE = {"Fed & rates", "Inflation", "Jobs", "Growth", "Consumer", "Housing", "Energy", "Trade & tariffs", "Budget & taxes"}
SKIP = r"obituar|\bdies\b|\bdied\b|recipe|celebrit|crossword|wedding|horoscope|sponsored|podcast:|^opinion|letters to the editor"
# Foreign stories rank lower unless they mention the U.S.
FOREIGN = r"\bboj\b|bank of (japan|korea|england|canada)|\becb\b|eurozone|\bchina\b|japan|korea|canad|europe|\buk\b|britain|germany|india"
US = r"\bu\.?s\.?\b|united states|america|\bfed\b|federal reserve|washington|trump|wall street"
ATOM = "{http://www.w3.org/2005/Atom}"


def clean(text, limit=400):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def parse_time(s):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def entries(xml_bytes):
    """Yield (title, link, summary, published) from an RSS or Atom document."""
    root = ET.fromstring(xml_bytes)
    for it in root.iter("item"):
        yield (it.findtext("title"), it.findtext("link"), it.findtext("description"), it.findtext("pubDate"))
    for it in root.iter(ATOM + "entry"):
        link = next((l.get("href") for l in it.findall(ATOM + "link") if l.get("rel", "alternate") == "alternate"), None)
        yield (it.findtext(ATOM + "title"), link, it.findtext(ATOM + "summary") or it.findtext(ATOM + "content"),
               it.findtext(ATOM + "published") or it.findtext(ATOM + "updated"))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def topics_of(text):
    return [name for name, pat in TOPICS if re.search(pat, text, re.I)]


def norm(title):
    return re.sub(r"[^a-z0-9 ]", "", title.lower())


def similar(a, b):
    wa, wb = set(norm(a).split()), set(norm(b).split())
    wa, wb = {w for w in wa if len(w) > 3}, {w for w in wb if len(w) > 3}
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.6


def main():
    now = dt.datetime.now(dt.timezone.utc)
    items, ok = [], 0
    for outlet, url, tier in FEEDS:
        try:
            data = fetch(url)
            got = 0
            limit = now - dt.timedelta(days=RESEARCH_DAYS if tier == "research" else DAYS)
            for title, link, summary, published in entries(data):
                title, summary = clean(title, 200), clean(summary)
                when = parse_time(published)
                if not title or not link or not when or when < limit or when > now + dt.timedelta(hours=2):
                    continue
                text = f"{title} {summary}"
                if re.search(SKIP, text, re.I):
                    continue
                tags = topics_of(text)
                if not CORE.intersection(tags):
                    continue
                items.append({"source": outlet, "tier": tier, "title": title, "summary": summary,
                              "link": link.strip(), "published": when.isoformat(timespec="minutes"), "topics": tags[:3]})
                got += 1
            ok += 1
            print(f"  ok  {outlet} {url}: {got} items")
        except Exception as err:  # one bad feed should not stop the run
            print(f"  ERR {outlet} {url}: {err}")
    if not ok:
        sys.exit("No feed could be read; keeping the existing data/news.js")

    # Rank: more economy topics and a real summary first, then outlet priority, then newest.
    def score(it):
        text = f"{it['title']} {it['summary']}"
        age_h = (now - dt.datetime.fromisoformat(it["published"])).total_seconds() / 3600
        return (len(CORE.intersection(it["topics"])) * 2 + len(it["topics"]) * 0.5 + (1 if len(it["summary"]) > 60 else 0)
                + (1.5 if it["tier"] == "premium" else 0) - age_h / 24
                - (3 if re.search(FOREIGN, text, re.I) and not re.search(US, text, re.I) else 0))
    items.sort(key=lambda it: (PRIORITY.get(it["source"], 9), -dt.datetime.fromisoformat(it["published"]).timestamp()))
    kept = []
    for it in items:  # keep the first (highest-priority outlet) copy of each story
        if not any(it["link"] == k["link"] or similar(it["title"], k["title"]) for k in kept):
            kept.append(it)
    kept.sort(key=score, reverse=True)
    kept = kept[:KEEP]
    for it in kept:
        it.pop("tier")
    payload = {"updated": now.isoformat(timespec="minutes"), "items": kept}
    OUT.write_text("window.NEWS_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")
    print(f"wrote {OUT} ({len(kept)} items from {ok} feeds)")


if __name__ == "__main__":
    main()
