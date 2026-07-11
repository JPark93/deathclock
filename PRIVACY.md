# Privacy Policy — Death Clock

**Last Updated: January 2026**

## Our Commitment
Death Clock is built with privacy by design. This document explains what data we process, how, and why.

## What Data We Process
You provide:
- Birth date
- Biological sex (male/female)
- Country of residence
- Self-reported lifestyle factors (smoking, exercise, alcohol consumption, BMI category)

## Where Data Is Processed
**Entirely in your browser.** All processing happens client-side via JavaScript. We have no servers, databases, APIs, or backend systems.

## What Data Is Transmitted
**Nothing.** After the initial page load (static HTML, CSS, JS, and a JSON data file from our CDN), zero network requests are made. Your inputs never leave your browser.

## Data Retention
Data exists only in your browser's RAM for the duration of your session. It is:
- Never written to localStorage, sessionStorage, cookies, or disk
- Automatically destroyed when you close the tab or navigate away
- Immediately destroyed when you click "Clear All Data"

## Web Worker Isolation
Sensitive computations run in a Web Worker (a separate JavaScript thread), providing process-level isolation:
- Raw input data is not accessible to the main page thread
- Only computed results (expiry date, modifier breakdown) are returned
- Input data is set to null after computation

## Content Security Policy
We enforce a strict CSP:
- `connect-src 'self'` — Only same-origin requests (for the static data file)
- `script-src 'self'` — Only our own scripts execute
- `default-src 'none'` — Everything denied by default
- `form-action 'none'` — Forms cannot submit data
- `frame-ancestors 'none'` — The page cannot be embedded in iframes

## No Third Parties
We use no analytics, advertising, social widgets, third-party fonts/CDNs, tag managers, or external JavaScript libraries.

## GDPR Compliance
- **Lawful basis**: Legitimate interest (providing the requested calculation tool)
- **Data minimization**: We only ask for data necessary for the calculation
- **Purpose limitation**: Data is used solely for displaying your countdown
- **Right to erasure**: Click "Clear All Data" or close the tab
- **Privacy by design**: Our client-side-only architecture is intentionally designed as privacy-by-design under Article 25
- **No data transfers**: Since no data leaves your browser, there are no cross-border transfers

## CCPA Compliance
We do not collect, sell, or share personal information. No "Do Not Sell My Personal Information" link is needed.

## Data Source Attribution
Life expectancy statistics are sourced from the WHO Global Health Observatory (GHO) API, fetched at build time and bundled as a static file. The WHO API is never contacted during your session.

## Contact
For privacy questions or concerns: JonathanParkPhD@gmail.com
