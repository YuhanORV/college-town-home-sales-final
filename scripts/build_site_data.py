"""Build data/site_data.json, a compact column-oriented copy of the dataset for the website.

Reads data/college_town_home_sales.csv (never modified) and keeps only the columns the site
uses. Every row is kept (35,442), including prices outside the $10,000 to $5,000,000 scope,
because Q2, Q3 and Q9 use all rows. Rules are applied in the browser, not here.

Run from the repository root:  python scripts/build_site_data.py
"""
import json
import pandas as pd

SRC = "data/college_town_home_sales.csv"
OUT = "data/site_data.json"

df = pd.read_csv(SRC, dtype={"zipcode": str, "county_fips": str, "parcel_number": str})
df["city_state"] = df["city"] + ", " + df["state"]

cities = sorted(df["city_state"].unique())
unis = sorted(df["university"].unique())


def to_int_list(s):
    return [None if pd.isna(x) else int(x) for x in s]


def to_float_list(s, nd):
    return [None if pd.isna(x) else round(float(x), nd) for x in s]


def date_list(s):
    return [None if pd.isna(x) else str(x) for x in s]


# Days on market = contract_date - list_date, only when both dates exist (blank is not zero).
dom = (pd.to_datetime(df["contract_date"]) - pd.to_datetime(df["list_date"])).dt.days

city_to_uni = df.groupby("city_state")["university"].agg(lambda s: s.mode().iloc[0]).to_dict()

out = {
    "meta": {
        "source": SRC,
        "rows": int(len(df)),
        "cities": cities,
        "universities": unis,
        "city_university": [unis.index(city_to_uni[c]) for c in cities],
        "note": "Column-oriented. city and university are indexes into the lists above. "
                "dom = contract_date - list_date in days (null when either date is blank). "
                "Feature flags: 1 yes, 0 no, null not reported.",
    },
    "city": [cities.index(c) for c in df["city_state"]],
    "uni": [unis.index(u) for u in df["university"]],
    "price": to_int_list(df["sale_price"]),
    "sale_date": date_list(df["sale_date"]),
    "dom": to_int_list(dom),
    "beds": to_int_list(df["beds"]),
    "miles": to_float_list(df["miles_to_campus"], 1),
    "sqft": to_int_list(df["living_area_sqft"]),
    "year_built": to_int_list(df["year_built"]),
    "garage": to_int_list(df["has_garage"]),
    "basement": to_int_list(df["has_basement"]),
    "fireplace": to_int_list(df["has_fireplace"]),
    "tax": to_float_list(df["tax_annual_amount"], 2),
    "lat": to_float_list(df["latitude"], 4),
    "lon": to_float_list(df["longitude"], 4),
}

with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"Wrote {OUT}: {len(df)} rows, {len(cities)} cities, {len(unis)} campus areas")
