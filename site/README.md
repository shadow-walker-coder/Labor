# Macro Monitor

A one-page running check on the U.S. economy. The page has seven sections: growth,
consumer health, jobs, inflation, financial conditions, bank lending and credit, and
the federal budget. Each section shows a
chart card per indicator (some cards compare several lines, such as loan standards vs. demand) with its latest reading, the change from a year earlier,
recession shading and hover values. A sticky bar jumps between sections and
switches every chart between 5Y, 10Y and All.

No framework and no build step: plain HTML, CSS and JavaScript, with charts drawn
as hand-written SVG.

## Files

| Path | What it does |
|---|---|
| `index.html` | Page shell |
| `styles.css` | Light and dark themes, layout |
| `app.js` | Builds the sections and draws the interactive charts |
| `data/series.js` | Data snapshot (generated, do not edit by hand) |
| `scripts/series_config.py` | **The list of indicators.** Add or remove series here |
| `scripts/fetch_data.py` | Pulls every configured series from the FRED API |
| `../.github/workflows/site.yml` | Refreshes the data every weekday and deploys to GitHub Pages |

## Run it

Open `site/index.html` in a browser. Nothing else is needed, because the data ships as a
script file.

## Refresh the data

Locally: `python site/scripts/fetch_data.py`. Without a key the script tries FRED's
public graph CSVs; set `FRED_API_KEY` (free at
https://fred.stlouisfed.org/docs/api/api_key.html) to use the official API.

On GitHub, `.github/workflows/site.yml` refreshes the data every weekday, on pushes to
`main` that touch `site/`, on pull requests, and on demand from the Actions tab. It
commits the new data and, outside pull requests, deploys `site/` to GitHub Pages.
If most downloads fail, it keeps the existing data instead of overwriting it.

One-time setup:

1. Settings > Secrets and variables > Actions > New repository secret named `FRED_API_KEY`.
   This is required on GitHub: FRED's keyless CSV endpoint does not answer GitHub's runners.
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.

## The latest and the GDP outlook

The two sections at the top are built in the browser from the same data file:

- **The latest** (`app.js`, `punchlines()` and `risks()`): one punchline each on growth, the labor
  market, inflation, consumer spending, and rates and energy, plus a list of ten risks (yield curve,
  Sahm-rule unemployment, jobless claims, sticky inflation, oil, bank credit, delinquencies, saving rate,
  financial conditions, long rates) flagged Calm, Watch or Concern by simple thresholds. The wording
  updates itself each time the data refreshes; edit the thresholds there.
- **GDP outlook** (`scripts/nowcast.py`): a bridge equation fitted at every refresh. Payrolls,
  industrial production and real consumer spending are averaged by quarter and regressed on real GDP
  growth. Once a quarter has some monthly data, the page shows a nowcast for it. Before then, it shows a
  one-quarter-ahead forecast that also uses the yield curve and the latest GDP print. The typical miss
  shown is the out-of-sample error from refitting on earlier data only. Inputs are set in
  `MODEL_INPUTS` in `series_config.py`.

## Add an indicator

Add one `dict(...)` to `SERIES` in `scripts/series_config.py`. A card can be a single
FRED series (`id=`), several lines on one axis (`lines=[...]`) or a ratio of two series
(`ratio=[numerator, denominator]`). The docstring at the top of that file lists every
option. Then rerun the fetch script. The front end picks it up
automatically.

## Ideas for next steps

- A plain-language summary at the top, generated from the latest readings
- NY Fed household debt by loan type and 90+ day delinquency (published as spreadsheets, not on FRED)
- State-level unemployment from BLS LAUS as a map
- Compare mode: index two series to the same start date on one chart
- Release calendar showing when each number next updates

## Consumer Earnings Monitor (`earnings/`)

A second page that reads the latest quarterly reports from 34 consumer companies (retail, restaurants,
airlines, hotels, cruise lines and car rental) for what they say about the U.S. consumer. The data is a
researched snapshot in `earnings/data/earnings.js`, not refreshed automatically. To add new quarters, put
research files in the same shape as the existing entries and run:

    python scripts/build_earnings.py new/*.json

This merges them, recomputes derived fields and rewrites `data/earnings_summary.js`, which feeds the
"What companies are saying" teaser on the main page.
