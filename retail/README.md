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
| `data/notes.json` | Caveats shown under "Notes on the data" |
| `../.github/workflows/retail-earnings.yml` | Runs the watcher twice each weekday (about 8:15am and 4:45pm ET), hourly 7am-7pm ET in the second half of Feb, May, Aug and Nov, and commits new reports |

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
         ticket_pct, ecom_yoy_pct, gross_margin_bps, eps_adj, eps_consensus, eps_ex_one_offs,
         inventory_yoy_pct, stock_reaction_pct            (null when not reported)
one_offs_undisclosed: true when EPS includes one-time items of unstated size
notes: caveats for this quarter, shown on the card
guidance: raised | maintained | lowered | initiated | mixed | none,  guidance_note
key_messages: 3-5 strings
consumer: verdict (strong | steady | choosy | strained), income_split, big_ticket, pricing, quote
themes: tags from THEMES in config.py
macro_read, sources: [{label, url}]
```

## Notes on the data

These caveats are kept in `data/notes.json` and shown at the bottom of the page under "Notes on the data".
Caveats about a single quarter are kept in that report's `notes` field and shown on its card.

1. **Starting data came from search summaries.** The 48 reports at launch (the last four quarters per
   retailer, through Amazon's Oct 29, 2026 release) were compiled from web-search summaries of company
   releases, SEC filings and financial press. The source pages themselves could not be opened, so each
   figure is as quoted there. Check any number against the linked release before quoting it.
2. **Blank figures.** A dash means not reported, not found, or sources disagreed (most often consensus and
   stock reactions). Figures supplied from memory rather than a source were removed: Walmart Q3 FY2026
   consensus and stock reaction, Costco Q1 FY2026 consensus.
3. **Judgements, not data.** Consumer verdicts, theme tags, "What it says" headlines, Economy lines and
   the briefing are written judgements based on what management said.
4. **Stock reaction coverage is thin.** The pulse tile shows a median only when at least half the
   retailers have a confirmed move, and says how many it covers.
5. **One-time items in EPS.** Mid-2026 results include one-time IEEPA tariff refunds. Where the per-share
   effect was disclosed (Target, Dollar Tree, Dollar General, Costco), `eps_ex_one_offs` holds EPS without
   it and the beat is measured on that. Where it was not (Home Depot, Walmart, Best Buy),
   `one_offs_undisclosed` is true; the card marks EPS with * and the pulse tile counts those beats
   separately. TJX and Ross adjusted EPS already exclude refunds. Amazon EPS is GAAP and in Q1 and Q2 2026
   included large Anthropic investment gains, so no consensus comparison is shown.
6. **Amazon is not a like-for-like comp.** It reports total online-stores growth, so it is marked † in the
   heatmap and left out of the median comp (`comp_is_growth` in `config.py`). Q3 2026 growth of 2% was
   held down by Prime Day moving into June, about 4 points by Amazon's estimate.
7. **Comps are defined differently.** Walmart U.S. ex fuel; Costco U.S. ex gas and FX; Home Depot U.S.;
   Kroger identical sales ex fuel; Best Buy Domestic; Dollar Tree segment; others total comparable sales.
   Treat small gaps between retailers as approximate.
8. **Calendar-quarter alignment is approximate for Costco and Kroger,** whose 12- and 16-week quarters
   don't line up with calendar quarters.
9. **Report dates are estimates** unless marked confirmed.
10. **Automatic drafts** come from the SEC-filed press release, have no consensus or stock move, and carry
    an "auto-drafted" badge until reviewed.
11. **The claude.ai page is a snapshot.** It changes only when it is republished; the repo copy is what the
    workflow updates.
