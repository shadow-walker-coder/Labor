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

Locally: `python site/scripts/fetch_data.py`. No key is needed: without one the script
downloads FRED's public graph CSVs. Set `FRED_API_KEY` (free at
https://fred.stlouisfed.org/docs/api/api_key.html) to use the official API instead.

On GitHub, `.github/workflows/site.yml` refreshes the data every weekday, on pushes to
`main` that touch `site/`, on pull requests, and on demand from the Actions tab. It
commits the new data and, outside pull requests, deploys `site/` to GitHub Pages.
If most downloads fail, it keeps the existing data instead of overwriting it.

One-time setup: Settings > Pages > Build and deployment > Source: **GitHub Actions**.
Adding a `FRED_API_KEY` repository secret is optional.

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
