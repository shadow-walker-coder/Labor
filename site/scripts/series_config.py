"""Which FRED series the dashboard shows, and how each card is drawn.

Edit this file to add, remove or reorder charts. Every field is copied into
data/series.js, so the front end needs no changes when you add a card.

A card is one of three kinds:
  single series   id="UNRATE"
  several lines   lines=[dict(id=..., label=...), ...]   (all lines share one axis and unit)
  ratio           ratio=["JTSJOL", "UNEMPLOY"]            (first series divided by second, by date)

Fields
  key         unique card id (defaults to id)
  section     one of SECTIONS keys
  title       card heading
  units       FRED units transformation for every line (lin, pc1, chg, ...)
  freq        optional FRED frequency aggregation (m, q, ...) for daily/weekly series
  agg         aggregation method when freq is set (avg, sum, eop)
  start       first date to download (defaults to START)
  scale       divide every value by this (e.g. 1000 to show claims in thousands)
  unit        label shown next to the number
  decimals    digits shown in readings
  chart       "line" or "bar" (bar only for single-series cards)
  target      optional dashed reference line, captioned by target_label
  ylim        optional [min, max] axis limits; values beyond them run off the chart
  fiscal      True for fiscal-year data (labels read "FY 2025")
  blurb       one or two plain sentences on what the number means
"""

SECTIONS = {
    "growth": "Growth",
    "consumer": "Consumer health",
    "jobs": "Jobs",
    "prices": "Inflation",
    "energy": "Energy",
    "money": "Financial conditions",
    "credit": "Bank lending & credit",
    "budget": "Federal budget",
}

# One-line introduction shown under each section heading.
SECTION_INTROS = {
    "growth": "How fast the economy is producing more goods and services.",
    "consumer": "Whether households are earning, spending and saving.",
    "jobs": "Whether people who want work can find it, and how much workers are moving.",
    "prices": "How quickly the cost of living is rising.",
    "energy": "What drivers pay at the pump and what a barrel of crude costs.",
    "money": "What it costs to borrow, and how easily money is flowing.",
    "credit": "Whether banks are willing to lend, whether borrowers want loans, and how many are falling behind.",
    "budget": "How much Washington borrows and what that debt costs.",
}

START = "2007-01-01"

SLOOS_NOTE = ("From the Fed's Senior Loan Officer Survey. Above zero on the standards line means more banks "
              "tightened than eased; above zero on the demand line means more saw stronger demand than weaker.")


def sloos(key, title, standards, demand, blurb):
    return dict(key=key, section="credit", title=title, units="lin", unit="net % of banks", decimals=1,
                chart="line", lines=[dict(id=standards, label="Tightening standards"),
                                     dict(id=demand, label="Stronger demand")],
                blurb=blurb + " " + SLOOS_NOTE)


SERIES = [
    # Growth
    dict(id="A191RL1Q225SBEA", section="growth", title="Real GDP growth", units="lin",
         unit="% annualized", decimals=1, chart="bar",
         blurb="Quarterly change in inflation-adjusted output, expressed at an annual pace. Two negative quarters in a row is the popular shorthand for recession."),
    dict(id="INDPRO", section="growth", title="Industrial production", units="pc1",
         unit="% y/y", decimals=1, chart="line",
         blurb="Output of factories, mines and utilities compared with a year earlier. It turns early in downturns."),

    # Consumer health
    dict(id="CES0500000003", section="consumer", title="Average hourly earnings", units="pc1",
         unit="% y/y", decimals=1, chart="line",
         blurb="Pay growth for private-sector workers. Compare it with inflation to see whether paychecks are gaining ground."),
    dict(id="DSPIC96", section="consumer", title="Real disposable income", units="pc1",
         unit="% y/y", decimals=1, chart="line", ylim=[-8, 12],
         blurb="After-tax household income adjusted for inflation, compared with a year earlier."),
    dict(id="PCEC96", section="consumer", title="Real consumer spending (PCE)", units="pc1",
         unit="% y/y", decimals=1, chart="line", ylim=[-8, 12],
         blurb="Inflation-adjusted spending on goods and services, which makes up about two thirds of GDP."),
    dict(id="RSAFS", section="consumer", title="Retail sales", units="pc1",
         unit="% y/y", decimals=1, chart="line", ylim=[-10, 20],
         blurb="Sales at stores, restaurants and online retailers compared with a year earlier. Not adjusted for inflation."),
    dict(id="PSAVERT", section="consumer", title="Personal saving rate", units="lin",
         unit="% of income", decimals=1, chart="line", ylim=[0, 15],
         blurb="Share of after-tax income households set aside rather than spend."),
    dict(id="TDSP", section="consumer", title="Household debt service", units="lin",
         unit="% of income", decimals=1, chart="line",
         blurb="Required mortgage and consumer debt payments as a share of disposable income."),

    # Jobs
    dict(id="UNRATE", section="jobs", title="Unemployment rate", units="lin",
         unit="%", decimals=1, chart="line",
         blurb="Share of people in the labor force who want work and cannot find it."),
    dict(id="PAYEMS", section="jobs", title="Payroll jobs added", units="chg",
         unit="k / month", decimals=0, chart="bar", ylim=[-900, 1000],
         blurb="Monthly change in nonfarm payroll employment from the BLS establishment survey."),
    dict(id="ICSA", section="jobs", title="Initial jobless claims", units="lin",
         freq="m", agg="avg", scale=1000, unit="k / week", decimals=0, chart="line", ylim=[0, 800],
         blurb="New filings for unemployment insurance, averaged over each month. The most timely read on layoffs."),
    dict(key="OPENINGS_PER_UNEMPLOYED", ratio=["JTSJOL", "UNEMPLOY"], section="jobs",
         title="Job openings per unemployed person", units="lin",
         unit="openings per person", decimals=2, chart="line", target=1.0, target_label="1 opening per job seeker",
         blurb="Job openings (JOLTS) divided by the number of unemployed people. Above 1 means more open jobs than job seekers."),
    dict(key="JOLTS_FLOWS", section="jobs", title="Hires, quits and layoffs", units="lin",
         unit="% of employment", decimals=1, chart="line", ylim=[0, 5],
         lines=[dict(id="JTSHIR", label="Hires rate"), dict(id="JTSQUR", label="Quits rate"),
                dict(id="JTSLDR", label="Layoffs rate")],
         blurb="Monthly JOLTS rates. More quits signals workers are confident they can find something better; rising layoffs signal trouble."),

    # Inflation
    dict(id="CPIAUCSL", section="prices", title="Consumer prices (CPI)", units="pc1",
         unit="% y/y", decimals=1, chart="line",
         blurb="The headline inflation rate households feel, including food and energy."),
    dict(id="CPILFESL", section="prices", title="Core CPI", units="pc1",
         unit="% y/y", decimals=1, chart="line",
         blurb="CPI without food and energy, which strips out the most volatile prices."),
    dict(id="PCEPI", section="prices", title="PCE prices", units="pc1",
         unit="% y/y", decimals=1, chart="line", target=2.0, target_label="Fed target 2%",
         blurb="Headline inflation measured on everything consumers buy, including food and energy."),
    dict(id="PCEPILFE", section="prices", title="Core PCE prices", units="pc1",
         unit="% y/y", decimals=1, chart="line", target=2.0, target_label="Fed target 2%",
         blurb="The Federal Reserve's preferred inflation gauge. Its target is 2%."),

    # Financial conditions
    dict(id="GASREGCOVM", section="energy", title="Gasoline price", units="lin",
         unit="$ per gallon", decimals=2, chart="line",
         blurb="Average U.S. retail price of regular gasoline, all formulations, monthly. A quick read on what households feel at the pump."),
    dict(key="CRUDE", section="energy", title="Crude oil prices", units="lin", unit="$ per barrel", decimals=2,
         chart="line", lines=[dict(id="MCOILWTICO", label="WTI (U.S.)"), dict(id="MCOILBRENTEU", label="Brent (global)")],
         blurb="Monthly average spot prices for West Texas Intermediate and Brent crude. Oil feeds into gasoline, shipping and airfares, so big moves show up in inflation a month or two later."),

    dict(id="FEDFUNDS", section="money", title="Federal funds rate", units="lin",
         unit="%", decimals=2, chart="line",
         blurb="The overnight rate the Fed steers to speed up or cool down the economy."),
    dict(id="DGS10", section="money", title="10-year Treasury yield", units="lin",
         freq="m", agg="avg", unit="%", decimals=2, chart="line",
         blurb="The benchmark long-term borrowing cost that mortgages and corporate debt are priced off."),
    dict(id="T10Y2Y", section="money", title="Yield curve (10y minus 2y)", units="lin",
         freq="m", agg="avg", unit="pts", decimals=2, chart="line",
         blurb="When short rates sit above long rates the curve is inverted. Inversions have preceded most recessions."),
    dict(id="MORTGAGE30US", section="money", title="30-year mortgage rate", units="lin",
         freq="m", agg="avg", unit="%", decimals=2, chart="line",
         blurb="Average rate on a new 30-year fixed mortgage, from Freddie Mac's weekly survey."),
    dict(id="NFCI", section="money", title="Financial conditions", units="lin",
         freq="m", agg="avg", unit="index", decimals=2, chart="line",
         blurb="Chicago Fed index. Zero is average; positive readings mean credit is tighter than normal."),

    # Bank lending & credit (Senior Loan Officer Survey, quarterly)
    sloos("SLOOS_CI", "Business loans (C&I)", "DRTSCILM", "DRSDCILM",
          "Commercial and industrial loans to large and middle-market firms."),
    sloos("SLOOS_CARD", "Credit card loans", "DRTSCLCC", "DEMCC",
          "Credit card lending to households."),
    sloos("SLOOS_AUTO", "Auto loans", "STDSAUTO", "DEMAUTO",
          "Loans to households for buying cars."),
    sloos("SLOOS_MORTGAGE", "Mortgages", "SUBLPDHMSENQ", "SUBLPDHMDENQ",
          "Residential mortgages that qualify for purchase by Fannie Mae and Freddie Mac."),
    sloos("SLOOS_OTHER", "Other consumer loans", "STDSOTHCONS", "DEMOTHCONS",
          "Consumer loans other than credit cards and auto loans."),
    dict(key="DELINQUENCY", section="credit", title="Loan delinquency rates", units="lin",
         unit="% of loans", decimals=1, chart="line",
         lines=[dict(id="DRCCLACBS", label="Credit cards"), dict(id="DROCLACBS", label="Other consumer"),
                dict(id="DRSFRMACBS", label="Mortgages")],
         blurb="Share of loans at U.S. commercial banks that are 30 or more days past due, seasonally adjusted."),

    # Federal budget
    dict(id="FYFSGDA188S", section="budget", title="Budget balance", units="lin", fiscal=True,
         start="2000-01-01", unit="% of GDP", decimals=1, chart="bar",
         blurb="Federal surplus or deficit for each fiscal year, scaled by the size of the economy."),
    dict(id="GFDEGDQ188S", section="budget", title="Federal debt", units="lin",
         unit="% of GDP", decimals=0, chart="line",
         blurb="Total public debt outstanding relative to annual GDP."),
    dict(id="A091RC1Q027SBEA", section="budget", title="Interest on federal debt", units="lin",
         unit="$bn / yr", decimals=0, chart="line",
         blurb="What Washington spends servicing its debt, at an annual rate."),
]

RECESSION_SERIES = "USREC"


# GDP model (see scripts/nowcast.py). Monthly levels are averaged by quarter and turned into
# annualized growth; the yield curve enters the one-quarter-ahead forecast.
MODEL_TARGET = "A191RL1Q225SBEA"
MODEL_INPUTS = [("PAYEMS", "Payroll jobs"), ("INDPRO", "Industrial production"),
                ("PCEC96", "Real consumer spending")]
MODEL_SPREAD = "T10Y2Y"
MODEL_START = "2006-01-01"
