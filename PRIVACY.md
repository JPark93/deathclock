# Privacy Policy — Death Clock

## Last Updated: January 2025

## Our Commitment
Death Clock is designed with privacy by design as a foundational principle. This document explains exactly what data we process, how, and why.

## What Data Do We Process?
When you use Death Clock, you provide:
- Your birth date
- Your biological sex (male/female)
- Your country of residence
- Self-reported lifestyle factors (smoking, exercise, alcohol consumption, BMI category)

## Where Is Data Processed?
**Entirely in your browser.** All data processing happens client-side using JavaScript running on your device. We have no servers, databases, APIs, or backend systems that process your data.

## What Data Is Transmitted?
**Nothing.** After the initial page load (which fetches static HTML, CSS, JS, and a JSON data file from our CDN), zero network requests are made. Your inputs never leave your browser.

## How Long Is Data Retained?
Data exists only in your browser's volatile memory (RAM) for the duration of your session. It is:
- Never written to localStorage or sessionStorage
- Never written to cookies
- Never written to disk
- Automatically destroyed when you close the tab or navigate away
- Immediately destroyed when you click "Clear All Data"

## Web Worker Isolation
Sensitive computations are performed in a Web Worker — a separate JavaScript execution thread. This provides process-level isolation, meaning:
- Your raw input data is not accessible to the main page thread
- Only computed results (expiry date, modifier breakdown) are returned
- Input data is explicitly set to null after computation

## Content Security Policy
We enforce a strict Content Security Policy:
- `connect-src 'self'` — Only same-origin requests are allowed (for loading the static data file)
- `script-src 'self'` — Only our own scripts can execute
- `default-src 'none'` — Everything is denied by default
- `form-action 'none'` — Forms cannot submit data anywhere
- `frame-ancestors 'none'` — The page cannot be embedded in iframes

## No Third Parties
We do not use:
- Analytics tools (no Google Analytics, Plausible, etc.)
- Advertising scripts
- Social media widgets
- Third-party fonts or CDNs
- Tag managers
- Any external JavaScript libraries

## GDPR Compliance
Under the General Data Protection Regulation (GDPR):
- **Lawful basis**: Legitimate interest (providing the requested calculation tool)
- **Data minimization**: We only ask for data necessary for the calculation
- **Purpose limitation**: Data is used solely for displaying your countdown
- **Right to erasure**: Click "Clear All Data" or simply close the tab
- **Privacy by design**: Our client-side-only architecture is intentionally designed as privacy-by-design under Article 25
- **No data transfers**: Since no data leaves your browser, there are no cross-border data transfers

## CCPA Compliance
Under the California Consumer Privacy Act (CCPA):
- We do not collect personal information
- We do not sell personal information
- We do not share personal information with third parties
- No "Do Not Sell My Personal Information" link is needed because we do not sell data

## Data Source Attribution
Life expectancy statistics are sourced from the World Health Organization Global Health Observatory (GHO) API. This data is fetched at build time and bundled as a static file. The WHO API is never contacted during your session.

## Contact
For privacy questions or concerns, please contact: JonathanParkPhD@gmail.com
