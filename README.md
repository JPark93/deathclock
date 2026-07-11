# Death Clock

A privacy-first, client-side web application that calculates your expected expiry date and displays a live countdown timer. All data processing happens entirely in your browser — nothing is stored, transmitted, or logged.

## Features
- Live countdown timer updating every second
- Life expectancy data from WHO Global Health Observatory API (194 countries)
- Optional state-level refinement for United States estimates
- Lifestyle factor modifiers (smoking, exercise, alcohol, BMI)
- Dark macabre visual theme
- 100% client-side — zero server requests after page load
- Web Worker isolation for sensitive data processing
- Fully responsive and offline-capable
- Canonical, Open Graph, and structured application metadata
- Sitemap plus an AI-readable project summary
- Privacy-preserving GitHub Sponsors support link

## Privacy Architecture
- All user input (birth date, sex, country, lifestyle factors) stays in browser memory only
- No localStorage, sessionStorage, or cookies
- Web Worker provides process-level isolation for PII computation
- Strict Content Security Policy: connect-src 'self' (no external requests)
- Data is explicitly nullified after computation
- "Clear All Data" button available at all times

## Tech Stack
- Vanilla HTML5, CSS3, JavaScript (ES6+) — zero dependencies
- Web Workers for isolated computation
- Python 3 (urllib only) for build-time data fetching

## Data Source
Life expectancy data is fetched at build time and bundled as a static JSON file, with no runtime requests to third-party services:

- WHO Global Health Observatory: `WHOSIS_000001` country and sex-specific life expectancy
- Our World in Data: historical country life expectancy used to extend year coverage
- CDC/NCHS: [U.S. State Life Tables, 2021](https://www.cdc.gov/nchs/data-visualization/state-life-expectancy/index_2021.htm), covering all 50 states and the District of Columbia by sex

The state figures are 2021 complete period life-table estimates. They refine the geographic baseline when a state is selected, but they are a population-level snapshot of 2021 mortality conditions, not historical state data for the user's birth year or an individual prediction.

## Lifestyle Modifiers
| Factor | Modifier | Notes |
|--------|----------|-------|
| Smoker | -10 years | Cumulative smoking impact estimate |
| Exercise (Moderate) | +3 years | Regular moderate exercise |
| Exercise (Active) | +5 years | Regular vigorous exercise |
| Alcohol (Low: 1-7 drinks/week) | -0.5 years | Based on pooled cohort evidence |
| Alcohol (Moderate: 8-14 drinks/week) | -1.5 years | Based on pooled cohort evidence |
| Alcohol (High: 15-20 drinks/week) | -3.0 years | Based on pooled cohort evidence |
| Alcohol (Very High: 21+ drinks/week) | -4.5 years | Based on pooled cohort evidence |
| BMI (Underweight) | -2 years | BMI < 18.5 |
| BMI (Overweight) | -2 years | BMI 25-30 |
| BMI (Obese) | -5 years | BMI > 30 |

Alcohol source notes:
- Lancet pooled analysis (Wood et al., 2018; 600,000 current drinkers, 19 countries): life expectancy at age 40 decreases with higher weekly intake, with approximate losses around 6 months (about 5-10 drinks/week), 1-2 years (10-15/week), and 4-5 years (>18/week).
- WHO (2024 fact sheet) and GBD 2016 analyses: risk increases with amount consumed; no level is risk-free at population level.

Note: These are population-level epidemiological estimates for entertainment purposes, not personalized medical advice.

## Data Refresh Workflow
Life expectancy data is fetched at build time from WHO, Our World in Data, and CDC/NCHS.

1. From the project root, run:
```bash
python scripts/fetch_data.py
```
2. This refreshes the country datasets and the official 2021 U.S. state dataset in `data/life_expectancy.json`
3. No pip dependencies needed — uses only Python 3 stdlib (`urllib`)
4. Commit the updated JSON file and push to your repository to refresh the live site

To refresh only the nested U.S. state records without rebuilding the country history:

```bash
python scripts/fetch_data.py --states-only
```

## Discovery and SEO

The production page includes:

- A canonical URL and descriptive search/social metadata in `index.html`
- `WebApplication` structured data that describes only visible, verifiable features
- A 1200 x 630 social preview image for Open Graph and large Twitter/X cards
- `sitemap.xml` for search engine submission
- `llms.txt` as a concise, plain-text summary for agents that choose to read the emerging convention
- A compact, crawlable methodology disclosure with source attribution, limitations, and privacy details

`llms.txt` is not a search-ranking standard and does not guarantee inclusion in AI answers. It complements crawlable HTML; it does not replace useful content, links, or a sitemap.

Because the production URL is under `/deathclock/`, this repository's `robots.txt` is published at `/deathclock/robots.txt`. Standard crawlers request `https://jonathanpark.dev/robots.txt`, so the domain-root site's robots file should also allow `/deathclock/` and reference `https://jonathanpark.dev/deathclock/sitemap.xml`. Submit that sitemap directly in Google Search Console and Bing Webmaster Tools as well.

## Monetization

The live page links to the active [JPark93 GitHub Sponsors profile](https://github.com/sponsors/JPark93), which accepts monthly and one-time support. It is a normal outbound link rather than an embedded widget, so GitHub loads nothing until a visitor chooses to follow it. Calculator inputs and results are never sent to GitHub.

Any future paid placement must be visibly labeled, use `rel="sponsored"` for paid outbound links, and receive no access to calculator inputs or result data.

Third-party display ads are not preconfigured because every network requires a real publisher ID and approval. Before enabling one:

1. Add the provider's actual seller entry to the domain-root `/ads.txt`; never deploy a placeholder publisher ID.
2. Add only the required script, image, frame, and connection origins to the CSP.
3. Update `PRIVACY.md` to name the provider and disclose cookies, storage, profiling, retention, and opt-out rights.
4. Implement consent where required before loading advertising or analytics code.
5. Recheck Core Web Vitals and mobile layout so ad loading does not displace the calculator.

## Deployment

### GitHub Pages (Recommended)
GitHub Pages is the simplest way to deploy this project. Follow these steps:

1. **Create a GitHub repository** — initialize it with the contents of this `DC/` directory as the root files.
2. **Push your files** to the default branch (e.g., `main`).
3. **Enable Pages**: Go to **Settings → Pages** in your repository, set the source to your default branch (`/root`), and save.
4. Your site will be live at `https://<username>.github.io/<repo-name>/` within a couple of minutes.

> **Security headers note:** GitHub Pages does not support custom `_headers` files. Security headers (CSP, X-Frame-Options, etc.) are implemented via `<meta>` tags in `index.html` instead.
>
> **Limitations:** HSTS and Permissions-Policy cannot be set via `<meta>` tags on GitHub Pages — this is a platform limitation. For full header control, see the alternative deployment options below.
>
> **frame-ancestors**: This CSP directive is ignored by browsers when specified via a `<meta>` tag per the CSP specification. It is therefore omitted from the meta-tag CSP on GitHub Pages. Clickjacking protection via `frame-ancestors` requires server-side HTTP headers, which are available on Netlify/Cloudflare Pages through the `_headers` file. On GitHub Pages, the app includes `frame-src 'none'` in its CSP as a partial mitigation.

### Cloudflare Pages (Full Header Support)
1. Upload the project directory to a Git repository.
2. Connect the repo to Cloudflare Pages.
3. Build command: leave blank (static files only).
4. Output directory: `/` (root).
5. The `_headers` file is automatically picked up for complete security header coverage (CSP, HSTS, Permissions-Policy, etc.).

### Netlify (Full Header Support)
1. Drag and drop the project directory to Netlify, or connect a Git repository with the project as the publish directory.
2. The `_headers` file is automatically recognized and applied for full security header coverage.

## Local Testing
Open index.html in a browser, or serve with any static file server:
```bash
python -m http.server 8000
```
Then visit http://localhost:8000

## Project Structure
```
DC/
├── index.html              Main application
├── css/
│   └── style.css           All styling (dark macabre theme)
├── js/
│   ├── app.js              Main application logic
│   └── worker.js           Web Worker for PII computation
├── data/
│   └── life_expectancy.json  Static WHO life expectancy data
├── scripts/
│   └── fetch_data.py       Build-time data fetcher
├── _headers                Security headers (CSP, HSTS, etc.)
├── _redirects              SPA redirect rule
├── README.md               This file
├── PRIVACY.md              Privacy policy
└── LICENSE                 MIT License
```

## Disclaimer
This application is for entertainment and educational purposes only. Life expectancy estimates are statistical averages and do not predict individual outcomes. Lifestyle modifiers are rough approximations based on epidemiological studies, not personalized medical advice. Consult a healthcare professional for health-related decisions.

## License
MIT License — see LICENSE file for details.

## Contact
Jonathan J. Park — JonathanParkPhD@gmail.com
