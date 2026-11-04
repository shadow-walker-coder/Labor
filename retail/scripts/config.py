"""Retailers tracked by the Retail Earnings Monitor, grouped by what they tell you.

To add a retailer: add a dict to RETAILERS (ticker, name, category, cik, comp_label),
then add its reports under retail/reports/<TICKER>/ (or let watch.py draft them).
CIK numbers are SEC company identifiers: https://www.sec.gov/cgi-bin/browse-edgar
"""

CATEGORIES = [
    dict(key="mass", short="Mass & clubs", name="Mass merchants & clubs",
         reads="The broadest read on the middle of the market: groceries, household basics and general merchandise."),
    dict(key="ecom", short="E-commerce", name="E-commerce",
         reads="Online share gains, marketplaces and discretionary goods bought online. Amazon is retail only (no AWS); eBay and Etsy report what shoppers buy on their marketplaces (GMV / GMS)."),
    dict(key="home", short="Home", name="Home improvement",
         reads="The housing proxy: turnover, mortgage rates, big-ticket projects and contractor demand."),
    dict(key="offprice", short="Off-price", name="Off-price apparel & home",
         reads="Treasure-hunt value shopping across incomes; a gauge of trade-down from department stores."),
    dict(key="value", short="Dollar & value", name="Dollar & value",
         reads="The clearest window on lower-income households: paycheck timing, benefits and trade-down."),
    dict(key="electronics", short="Electronics", name="Electronics",
         reads="Pure discretionary, big-ticket demand and replacement cycles."),
    dict(key="grocery", short="Grocery", name="Grocery",
         reads="Food inflation, private label and pharmacy: the non-negotiable part of the budget."),
]

RETAILERS = [
    dict(ticker="WMT", name="Walmart", category="mass", cik=104169,
         comp_label="Walmart U.S. comp ex fuel"),
    dict(ticker="COST", name="Costco", category="mass", cik=909832,
         comp_label="U.S. comp ex gas & FX"),
    dict(ticker="TGT", name="Target", category="mass", cik=27419,
         comp_label="Comparable sales"),
    # comp_is_growth: the headline figure is total growth, not a like-for-like comp,
    # so it is marked in the heatmap and left out of the median comp.
    dict(ticker="AMZN", name="Amazon", category="ecom", cik=1018724,
         comp_label="Online stores sales growth", comp_is_growth=True),
    dict(ticker="EBAY", name="eBay", category="ecom", cik=1065088,
         comp_label="GMV growth", comp_is_growth=True),
    dict(ticker="ETSY", name="Etsy", category="ecom", cik=1370637,
         comp_label="GMS growth", comp_is_growth=True),
    dict(ticker="HD", name="Home Depot", category="home", cik=354950,
         comp_label="U.S. comparable sales"),
    dict(ticker="LOW", name="Lowe's", category="home", cik=60667,
         comp_label="Comparable sales"),
    dict(ticker="TJX", name="TJX", category="offprice", cik=109198,
         comp_label="Comparable store sales"),
    dict(ticker="ROST", name="Ross Stores", category="offprice", cik=745732,
         comp_label="Comparable store sales"),
    dict(ticker="DG", name="Dollar General", category="value", cik=29534,
         comp_label="Same-store sales"),
    dict(ticker="DLTR", name="Dollar Tree", category="value", cik=935703,
         comp_label="Dollar Tree comparable sales"),
    dict(ticker="BBY", name="Best Buy", category="electronics", cik=764478,
         comp_label="Domestic comparable sales"),
    dict(ticker="KR", name="Kroger", category="grocery", cik=56873,
         comp_label="Identical sales ex fuel"),
]

VERDICTS = ["strong", "steady", "choosy", "strained"]
GUIDANCE = ["raised", "maintained", "lowered", "initiated", "mixed", "none"]

THEMES = {
    "value_seeking": "Value seeking / trade-down",
    "high_income_gains": "Higher-income shoppers driving gains",
    "low_income_stress": "Lower-income stress",
    "big_ticket_weak": "Big-ticket / discretionary soft",
    "discretionary_ok": "Discretionary holding up",
    "essentials_strong": "Essentials & grocery strong",
    "housing_drag": "Housing drag",
    "tariff_pricing": "Tariffs & price increases",
    "price_deflation": "Price cuts & promotions",
    "traffic_up": "Traffic rising",
    "traffic_down": "Traffic falling",
    "digital_strength": "Digital, delivery & ads",
    "membership_strength": "Membership strength",
    "weather_calendar": "Weather & calendar effects",
    "inventory_clean": "Lean inventories",
    "pro_contractor": "Contractor (Pro) demand",
}
