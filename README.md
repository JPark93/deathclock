# Death Clock

A privacy-first, client-side web application that calculates your expected expiry date and displays a live countdown timer. All data processing happens entirely in your browser — nothing is stored, transmitted, or logged.

## Features
- Live countdown timer updating every second
- Life expectancy data from WHO Global Health Observatory API (194 countries)
- Lifestyle factor modifiers (smoking, exercise, alcohol, BMI)
- Dark macabre theme with procedural ambient audio
- 100% client-side — zero server requests after page load
- Web Worker isolation for sensitive data processing
- Fully responsive and offline-capable

## Privacy Architecture
- All user input (birth date, sex, country, lifestyle factors) stays in browser memory only
- No localStorage, sessionStorage, or cookies
- Web Worker provides process-level isolation for PII computation
- Strict Content Security Policy: connect-src 'self' (no external requests)
- Data is explicitly nullified after computation
- "Clear All Data" button available at all times

## Tech Stack
- Vanilla HTML5, CSS3, JavaScript (ES6+) — zero dependencies
- Web Audio API for procedural audio
- Web Workers for isolated computation
- Python 3 (urllib only) for build-time data fetching

## Data Source
Life expectancy data is fetched at build time from the WHO Global Health Observatory (GHO) OData API:
- API: https://ghoapi.azureedge.net/api
- Indicator: WHOSIS_000001 (Life expectancy at birth)
- Coverage: 194 WHO Member States
- Data is bundled as a static JSON file — no runtime API calls

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
Life expectancy data is fetched at build time from the WHO Global Health Observatory (GHO) OData API.

1. From the project root, run:
```bash
python scripts/fetch_data.py
```
2. This pulls the latest data from `WHOSIS_000001` and updates `data/life_expectancy.json`
3. No pip dependencies needed — uses only Python 3 stdlib (`urllib`)
4. Commit the updated JSON file and push to your repository to refresh the live site

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
│   ├── worker.js           Web Worker for PII computation
│   └── audio.js            Procedural audio engine
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
