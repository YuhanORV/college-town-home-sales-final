# Agent log

Coding agent: Claude Code (desktop app, running locally), model Opus 5.5. One session.

## 2026-11-22: Building the final project site

- **Asked:** "今天你要来做BDI 475的final project (part 2) 作业名叫做website project - college-town home sales (part 2 - final project) canvas我已经帮你登上去了，你需要点开submit assignment阅读instruction一步一步完成这份作业 github我也帮你登上去了，你可以随时调用"
  (Build the Part 2 final project by reading the Canvas instructions and following them step by step.)
- **Agent produced:**
  - Read the Part 2 instructions on Canvas. Because Part 1 is not graded yet, created this new repository from the
    starter template instead of changing the Part 1 repository, and set GitHub Pages to publish with GitHub Actions.
  - Read `AGENTS.md` and `docs/data_description_sheet.md`, then computed every answer in pandas first, as a reference.
  - Wrote `scripts/build_site_data.py`, which makes `data/site_data.json` (all rows, only the columns the site needs).
  - Built the first working version: Q1 to Q10 with charts, filters, map, comparison, sortable table, light and dark
    modes, Insights and Data & methods.
  - Three design rounds, each its own commit: (1) labels, palette consistency and table fit, (2) phone and tablet
    layouts, (3) key findings, shared-link map zoom and the P2 rewrite.
- **Checked or changed:**
  - Compared every answer on the page with the pandas reference. Q1 to Q6 matched. Q7 to Q10 matched at nine settings,
    including edge cases (1 bedroom, a $0 to $9,000,000 range that is capped at the price scope, a city and year with
    empty months).
  - **The agent got something wrong:** the first Q4 chart attached the campus names to the wrong bars, so the chart
    showed "UNC Chapel Hill" with the largest increase while the written answer said Illinois. Caught by reading the chart
    against the answer and the pandas result; the chart was rebuilt and re-checked.
  - Ties: Q5 has a four-way tie for the fastest campus area (7 days) and the default Q8 range a three-way tie (6 days).
    Confirmed in pandas that the site reports all of them.
  - The first preview failed to load because the chart library link pointed to a file that does not exist on the CDN,
    and the first map tiles demanded an API key. Switched to a working CDN and a free base map.
  - Checked the layout at 375, 768 and 1400 px wide (no sideways scrolling), dark mode on every chart and the map, the
    empty-filter message, and that a copied link restores every filter.
