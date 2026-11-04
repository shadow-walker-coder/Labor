# Retail Earnings Monitor

A standalone dashboard that reads every quarterly earnings report from the big U.S. retailers
for what it says about the consumer and the economy. It is separate from the Macro Monitor in
`site/` and shares no code or data with it.

Open `retail/index.html` in a browser. Nothing else is needed, because the data ships as a script file.

## What's on the page

- **The read on the consumer**: a headline verdict and 5 to 7 cross-retailer takeaways (`data/briefing.json`).
- **Consumer pulse**: how many retailers' latest reports read strong / steady / choosy / strained, median
  comp sales, EPS beats, guidance raised vs cut, median stock reaction, and the themes management keeps raising.
- **One card per retailer, grouped by category**: "What it says" in one line, comp sales on the yellow tag,
  traffic, ticket, digital, margin, EPS vs consensus, guidance, stock move, 3 to 5 key messages, what
  management said about income groups / discretionary / pricing, a comp chart by quarter, the read for the
  economy, earlier quarters, and source links.
- **Comp sales heatmap**: every retailer's comps lined up by calendar quarter, so different fiscal years compare.
- **Earnings calendar**: next report dates, confirmed or estimated.

## Categories

| Category | Retailers | What it tells you |
|---|---|---|
| Mass merchants & clubs | Walmart, Costco, Target | The middle of the market |
| E-commerce | Amazon (retail only, no AWS) | Online share, delivery, ads |
| Home improvement | Home Depot, Lowe's | Housing, big-ticket projects, contractors |
| Off-price apparel & home | TJX, Ross | Value shopping, trade-down from department stores |
| Dollar & value | Dollar General, Dollar Tree | Lower-income households |
| Electronics | Best Buy | Pure discretionary, replacement cycles |
| Grocery | Kroger | Food inflation, private label, pharmacy |

Add a retailer or category in `scripts/config.py`.

## Files

| Path | What it does |
|---|---|
| `reports/<TICKER>/<period_end>.json` | **One file per earnings release.** The record behind each card |
| `data/briefing.json` | The briefing at the top |
| `data/calendar.json` | Next report date per retailer |
| `data/earnings.js` | Built from the files above (generated, do not edit) |
| `scripts/config.py` | Retailers, categories, theme vocabulary |
| `scripts/build.py` | Validates every report and writes `data/earnings.js` |
| `scripts/watch.py` | Finds new earnings filings on SEC EDGAR and drafts reports with Claude |
| `../.github/workflows/retail-earnings.yml` | Runs the watcher twice each weekday and commits new reports |

## How new earnings arrive

Every listed retailer files an 8-K with Item 2.02 on earnings day, with the press release attached as
Exhibit 99.1. `watch.py` checks each company's filings, and for any release newer than the latest report:

- with `ANTHROPIC_API_KEY` set, Claude reads the press release and drafts the full record in the
  dashboard's schema (`status: "draft"`). The card shows an "auto-drafted, not yet reviewed" badge, and the
  briefing is rewritten from the latest reports.
- without a key, it writes a `pending` stub so the card shows "new results filed, summary pending" with the filing link.

A press release has no consensus estimates or stock reaction, so drafts leave those empty. To review a draft,
check it, add those figures if you want them, and delete the `"status": "draft"` line.

Run it locally:

```
pip install anthropic
SEC_USER_AGENT="Your Name you@example.com" ANTHROPIC_API_KEY=... python retail/scripts/watch.py --brief
python retail/scripts/build.py
```

### One-time GitHub setup

1. Settings > Secrets and variables > Actions > **Variables**: add `SEC_USER_AGENT` with your name and
   email. SEC requires every automated client to identify itself; without it the watcher skips its check.
2. Same page > **Secrets**: add `ANTHROPIC_API_KEY` to have Claude draft new reports. Without it you get pending stubs.

## Editing a report by hand

Every field is described in the record format below. Run `python retail/scripts/build.py` afterwards; it
rejects unknown verdicts, guidance values or themes.

```
ticker, fiscal_period, period_end, report_date, headline
metrics: revenue_bn, revenue_yoy_pct, revenue_consensus_bn, comp_pct, comp_label, traffic_pct,
         ticket_pct, ecom_yoy_pct, gross_margin_bps, eps_adj, eps_consensus, inventory_yoy_pct,
         stock_reaction_pct            (null when not reported)
guidance: raised | maintained | lowered | initiated | mixed | none,  guidance_note
key_messages: 3-5 strings
consumer: verdict (strong | steady | choosy | strained), income_split, big_ticket, pricing, quote
themes: tags from THEMES in config.py
macro_read, sources: [{label, url}]
```

## About the starting data

The first 48 reports (the last four quarters for each retailer, through Amazon's Q3 2026 on Oct 29, 2026)
were compiled from company releases as quoted in search results and financial press. Figures that could not
be confirmed, or that sources disagreed on, were left empty. Spot-check against the linked releases before
relying on a specific number. Two things to keep in mind when reading mid-2026 results:

- **IEEPA tariff refunds** lifted Q2 margins and EPS at several retailers (Target, Home Depot, Dollar Tree,
  Dollar General, Costco, Walmart). The key messages say how much where it was disclosed.
- **Amazon** comp is reported online stores growth (not ex-FX), and its EPS is GAAP, which includes gains
  on investments in some quarters.
