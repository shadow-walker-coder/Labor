// FOMC Summary of Economic Projections: median of Fed officials' projections.
// Update by hand after each projection meeting (March, June, September, December).
// Inflation and GDP are fourth quarter over fourth quarter; unemployment is the Q4 average;
// the federal funds rate is the year-end midpoint.
window.FOMC_SEP = {
  "meeting": "2026-09-16",
  "label": "September 2026",
  "url": "https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260916.htm",
  "years": ["2026", "2027", "2028", "2029"],
  "median": {
    "gdp":      [2.3, 2.4, 2.2, 2.1],
    "unrate":   [4.1, 4.1, 4.1, 4.1],
    "pce":      [3.7, 2.3, 2.1, 2.0],
    "core_pce": [3.4, 2.5, 2.2, 2.0],
    "fedfunds": [4.1, 4.1, 3.9, 3.6]
  },
  "longer_run": {"gdp": 2.0, "unrate": 4.2, "pce": 2.0, "fedfunds": 3.2}
};
