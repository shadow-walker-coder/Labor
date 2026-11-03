"""A small GDP nowcast: a "bridge equation" from monthly data to quarterly GDP growth.

The idea: monthly numbers on jobs, factory output and consumer spending arrive weeks
before the GDP report. Each quarter, we average them, turn them into annualized
quarter-over-quarter growth rates, and regress real GDP growth on them. The fitted
equation then turns the months we already have for the current quarter into an
estimate of GDP growth before BEA publishes it.

Choices, kept deliberately simple so the method is easy to explain:
- Fit on 2007 onward, leaving out 2020 Q1 to 2021 Q2: the pandemic swings are so large
  they would otherwise decide the coefficients by themselves.
- A quarter with only one or two months in hand holds the missing months at the latest
  reading (no change). The output says how many months each input has.
- The "typical miss" is the out-of-sample error: refit on earlier data only, predict the next
  quarter, repeat from 2012 on. Real-time errors are larger still,
  because the monthly data and GDP itself both get revised.

Uses only the standard library.
"""

import math

EXCLUDE = ("2020-01-01", "2021-04-01")  # inclusive range of quarters left out of the fit


def quarter_start(date):
    y, m = int(date[:4]), int(date[5:7])
    return f"{y:04d}-{(m - 1) // 3 * 3 + 1:02d}-01"


def next_quarter(q):
    y, m = int(q[:4]), int(q[5:7]) + 3
    if m > 12:
        y, m = y + 1, m - 12
    return f"{y:04d}-{m:02d}-01"


def prev_quarter(q):
    y, m = int(q[:4]), int(q[5:7]) - 3
    if m < 1:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}-01"


def quarterly_means(obs, through=None):
    """obs: [(date, value)] monthly. Returns ({quarter: mean}, {quarter: months observed}).
    If `through` is a quarter, months missing from it are filled with the last value seen."""
    by_q = {}
    for d, v in obs:
        if v is not None:
            by_q.setdefault(quarter_start(d), []).append(v)
    counts = {q: len(v) for q, v in by_q.items()}
    if through and by_q:
        last_val = [v for d, v in obs if v is not None][-1]
        q = max(by_q)
        while q <= through:
            vals = by_q.setdefault(q, [])
            vals.extend([last_val] * (3 - len(vals)))
            counts.setdefault(q, 0)
            q = next_quarter(q)
    return {q: sum(v) / len(v) for q, v in by_q.items() if len(v) == 3}, counts


def annualized(levels):
    out = {}
    for q, v in levels.items():
        p = levels.get(prev_quarter(q))
        if p:
            out[q] = ((v / p) ** 4 - 1) * 100
    return out


def solve(a, b):
    """Gaussian elimination with partial pivoting for a small square system."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c and m[c][c]:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def ols(xs, ys):
    """xs: rows of regressors (an intercept is added). Returns coefficients."""
    rows = [[1.0] + list(x) for x in xs]
    k = len(rows[0])
    xtx = [[sum(r[i] * r[j] for r in rows) for j in range(k)] for i in range(k)]
    xty = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(k)]
    return solve(xtx, xty)


def fit_stats(rows, ys, predict):
    fitted = [predict(x) for x in rows]
    mean_y = sum(ys) / len(ys)
    ss_res = sum((y - f) ** 2 for y, f in zip(ys, fitted))
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    return round(1 - ss_res / ss_tot, 3), math.sqrt(ss_res / len(ys))


def out_of_sample(qs, rows, ys, first="2012-01-01"):
    """Refit on everything before each quarter from `first` on and predict that quarter.
    Returns the root-mean-square error of those predictions, or None."""
    errs = []
    for i, q in enumerate(qs):
        if q < first or i < 12:
            continue
        b = ols(rows[:i], ys[:i])
        errs.append(ys[i] - (b[0] + sum(c * v for c, v in zip(b[1:], rows[i]))))
    return round(math.sqrt(sum(e * e for e in errs) / len(errs)), 2) if errs else None


def model(name, qs, rows, ys, labels):
    beta = ols(rows, ys)
    predict = lambda x: beta[0] + sum(b * v for b, v in zip(beta[1:], x))
    r2, rmse = fit_stats(rows, ys, predict)
    return predict, beta, {
        "name": name, "fit_start": qs[0], "fit_end": qs[-1], "n": len(qs), "r2": r2,
        "rmse": round(rmse, 2), "oos_rmse": out_of_sample(qs, rows, ys),
        "coefs": [{"label": "Constant", "value": round(beta[0], 3)}] +
                 [{"label": lab, "value": round(b, 3)} for lab, b in zip(labels, beta[1:])],
    }


def excluded(q):
    return EXCLUDE[0] <= q <= EXCLUDE[1]


def build(gdp_growth, inputs, spread):
    """gdp_growth: [(quarter date, q/q annualized %)] from BEA.
    inputs: [(id, label, monthly level obs)] for the bridge equation.
    spread: monthly 10-year minus 2-year Treasury spread, used by the next-quarter forecast.
    Returns a dict for the page, or None if the inputs are missing."""
    gdp = {d: v for d, v in gdp_growth if v is not None}
    if not gdp or not spread or any(not obs for _, _, obs in inputs):
        return None
    last_gdp = max(gdp)
    nxt = next_quarter(last_gdp)
    latest_month = max(max(d for d, v in obs if v is not None) for _, _, obs in inputs)
    have_next = quarter_start(latest_month) >= nxt

    growth, months = [], []
    for _, _, obs in inputs:
        levels, counts = quarterly_means(obs, through=nxt if have_next else None)
        growth.append(annualized(levels))
        months.append(counts)
    curve = quarterly_means(spread)[0]
    labels = [lab for _, lab, _ in inputs]

    # 1) Nowcast: GDP growth in a quarter from the same quarter's monthly data.
    qs = [q for q in sorted(gdp) if all(q in g for g in growth) and not excluded(q)]
    rows = [[g[q] for g in growth] for q in qs]
    ys = [gdp[q] for q in qs]
    now_pred, now_beta, now_info = model("Nowcast (same quarter)", qs, rows, ys, labels)

    # 2) Forecast: next quarter's GDP growth from this quarter's data, GDP growth and the yield curve.
    f_labels = labels + ["Yield curve (10y-2y)", "GDP growth this quarter"]
    fx = lambda q: [g[q] for g in growth] + [curve[q], gdp[q]]
    fq = [q for q in sorted(gdp) if next_quarter(q) in gdp and all(q in g for g in growth) and q in curve
          and not excluded(q) and not excluded(next_quarter(q))]
    f_pred, f_beta, f_info = model("Forecast (one quarter ahead)", fq, [fx(q) for q in fq],
                                   [gdp[next_quarter(q)] for q in fq], f_labels)

    first = qs[0]
    out = {
        "excluded": list(EXCLUDE),
        "actual": [[q, round(gdp[q], 2)] for q in sorted(gdp) if q >= first],
        "fitted": [[q, round(now_pred([g[q] for g in growth]), 2)]
                   for q in sorted(gdp) if q >= first and all(q in g for g in growth)],
        "last_actual": [last_gdp, round(gdp[last_gdp], 2)],
        "models": [now_info, f_info],
        "nowcast": None,
        "forecast": None,
    }
    if have_next and all(nxt in g for g in growth):
        x = [g[nxt] for g in growth]
        est = now_pred(x)
        rmse = now_info["oos_rmse"] or now_info["rmse"]
        out["nowcast"] = {
            "quarter": nxt, "value": round(est, 2), "low": round(est - rmse, 2), "high": round(est + rmse, 2),
            "constant": round(now_beta[0], 2),
            "inputs": [{"id": i, "label": lab, "growth": round(v, 2), "months": min(m.get(nxt, 0), 3),
                        "contribution": round(b * v, 2)}
                       for (i, lab, _), v, b, m in zip(inputs, x, now_beta[1:], months)],
        }
    if last_gdp in curve and all(last_gdp in g for g in growth):
        x = fx(last_gdp)
        est = f_pred(x)
        rmse = f_info["oos_rmse"] or f_info["rmse"]
        out["forecast"] = {
            "quarter": nxt, "based_on": last_gdp, "value": round(est, 2),
            "low": round(est - rmse, 2), "high": round(est + rmse, 2), "constant": round(f_beta[0], 2),
            "inputs": [{"label": lab, "value": round(v, 2), "contribution": round(b * v, 2)}
                       for lab, v, b in zip(f_labels, x, f_beta[1:])],
        }
    return out
