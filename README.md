# Campus Markets: College-Town Home Sales, 2023–2026

An interactive report on 35,442 home sales near 11 university campuses, in 18 cities and towns across 11 states.
It answers ten business questions about prices, speed of sale and property taxes, each with a chart, and lets you
explore the market with filters, a map and a side-by-side comparison.

**Live site: https://yuhanorv.github.io/college-town-home-sales-final/**

## What the site answers

| | Question | Chart |
|---|---|---|
| Q1 | Which city has the highest median sale price? | Bar chart |
| Q2 | Using all rows, which city's mean is furthest above its median, and why? | Dumbbell dot plot |
| Q3 | Which cities change rank by mean price once the price rule is applied? | Slope chart |
| Q4 | Percent change in median price, 2024 to 2025, by campus area | Diverging bar chart |
| Q5 | Slowest and fastest campus areas by median days on market | Lollipop chart |
| Q6 | Total property tax as a percent of total sale price, by campus area | Bar chart |
| Q7 | For a chosen number of bedrooms, the cheapest city | Bar chart (interactive) |
| Q8 | For a chosen price range, the fastest-selling city | Bar chart (interactive) |
| Q9 | Sales per month for a chosen city and year | Column chart (interactive) |
| Q10 | Median distance to campus for a campus area, budget and minimum bedrooms | Histogram (interactive) |

Q1 to Q6 always use the full dataset. Q7 to Q10 recompute their chart and written answer whenever their inputs change.
An **Insights** section covers a data-quality problem (impossible prices) and what it was like to build the analysis with
a coding agent.

**Features:** filters for campus area or city, sale year, bedrooms and price range; a distance-from-campus range slider
with matching number inputs; Any / Yes / No / Unknown filters for garage, basement and fireplace; key numbers that update
with the filters; a clickable map that filters to a city; a side-by-side comparison of any two campus areas or cities; a
sortable city table; filter settings saved in the page address (shareable links); light and dark modes; and a layout that
works on desktop, tablet and phone.

## Data notes

- **Price scope.** Analyses use sales with a `sale_price` from $10,000 to $5,000,000, inclusive. This removes 71 rows
  (40 under $10,000, including one at $0, and 31 over $5,000,000, up to $81,510,000). Q2 and Q3 use all rows where the
  question says so, and Q9 counts every row with a sale date.
- **Days on market** is `contract_date` minus `list_date`, only for rows that have both dates. A blank is never treated
  as zero.
- **Missing values** are left out of the calculation that needs them. Blank garage, basement and fireplace values are
  shown as "Unknown", not "No".
- **Q6 tax rule.** Only rows with a tax amount above $0 and below 10% of the sale price (removes errors such as a
  $1,000,000,000 tax bill).
- **Groups.** Campus area = the `university` column (11 values); city = city and state together (18 values).
- **No deduplication by address.** `listing_id` is the key; units in the same building are separate sales.
- `home_type` is not used, because it is unreliable (State College condos are labeled single family).
- Medians unless a question asks for a mean. Ties are reported together.

The page reads `data/site_data.json`, a compact copy of the CSV with every row and only the columns the site needs. It is
built by `scripts/build_site_data.py`. The five original dataset files in `data/` are unchanged. Every number on the site
is computed in the browser from the data; none is typed in.

## How it was built

- **Coding agent:** Claude Code (desktop app, running locally), model Opus 5.5. See `AGENT_LOG.md`.
- **Checking:** every answer was recomputed independently in pandas from the raw CSV and compared with the site,
  including Q7 to Q10 at nine different settings.
- **Libraries:** [Apache ECharts](https://echarts.apache.org/) 5.5.1 for charts, [Leaflet](https://leafletjs.com/) 1.9.4
  for the map (Esri gray canvas base map), Google Fonts (Fraunces and Inter). Plain HTML, CSS and JavaScript with no
  build step, published by GitHub Actions to GitHub Pages.

| Path | What it is |
|---|---|
| `index.html` | The page |
| `assets/app.js` | All calculations, charts, filters and the map |
| `assets/styles.css` | Styles, light and dark themes |
| `data/site_data.json` | Compact data file the page loads |
| `scripts/build_site_data.py` | Builds `site_data.json` from the CSV |
| `docs/data_description_sheet.md` | Dataset documentation |

## Citation

College-town home sales dataset, version 1.0 (2026). University of Illinois-Deloitte Foundation Center for Business
Emerging Technologies. Data collected March 2026.
