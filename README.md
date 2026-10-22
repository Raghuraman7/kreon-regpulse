# Kreon RegPulse — Compliance Register

A single-page application that scrapes and tracks RBI's Master Directions applicable to **Non-Banking Financial Companies - Investment and Credit Companies (NBFC-ICC)**. 

No backend, no server costs. A GitHub Action fetches latest regulations on a schedule, parses them into JSON, and commits them. A build step turns that JSON into a static site: one page per entry, per register and per topic, with zero JavaScript except the search page.

## How it works

```
scripts/fetch-master-directions.mjs  → fetches, parses, and filters NBFC directions to NBFC-ICC
data/*.json                           → the registers the site is built from (committed to the repo)
site/build.mjs                        → validates data/*.json and writes static HTML to dist/
site/content.mjs                      → hand-written topic summaries, compliance baselines and amendments
site/styles.css, site/search.js       → design tokens + components; the search page script (Pagefind)
vercel.json                           → tells Vercel to run `npm run build` and serve dist/
.github/workflows/update-feed.yml     → runs fetch script daily, commits updates
```

## Run it locally

```bash
npm install
npm run fetch              # pulls latest from RBI/SEBI/MCA/ICSI → data/*.json
npm run build              # validates data, writes dist/ and the Pagefind search index
npm run serve              # preview dist/ at localhost
npm run build:test         # same build with a "TEST BUILD" banner and noindex
# or both:
npm start
```

**Daily auto-fetch on your Mac (no GitHub):** see `DEPLOY.md` — add a cron job for `scripts/daily-fetch.sh`.

**Put it online with a custom domain (free):** see `DEPLOY.md` (Vercel / Cloudflare Pages).

## Deploying to Production (GitHub Actions + Vercel)

1. Push this repository to GitHub.
2. Go to **Vercel** and import the repository. `vercel.json` sets the build command (`npm run build`) and output directory (`dist`). The build fails, and the previous deploy stays live, if any data item is invalid (missing title, non-http link, unparseable date).
3. In GitHub, go to **Settings → Actions → General → Workflow permissions** and select **Read and write permissions** (needed so the scheduled runner can commit `data/master-directions.json`).
4. Every day at 9:00 AM IST (or when manually run from the Actions tab), the GitHub Action fetches updates, commits them, and Vercel redeploys them automatically.

## Notes

- **Secretarial Standards** are read from ICSI's content API (`webcms.icsi.edu/api/resolve/?path=/member/icsi-standards`), because ICSI rebuilt icsi.edu as a JavaScript app in 2026 and the old pages now 404. See the header of `scripts/fetch-secretarial-standards.mjs`.
- **SEBI Regulations** track Credit Rating Agencies, KRA, Non-Convertible Securities, LODR and Insider Trading (PIT), plus any debt/credit-related regulation found automatically. Add SAST or ICDR to `TRACKED_REGS` in `scripts/fetch-sebi-regulations.mjs` if the company lists equity.
- **Viewing PDFs:** "View PDF" opens the regulator's PDF in the browser's viewer (which has its own download button). ICSI forces downloads, so `npm run build` copies ICSI's PDFs into `dist/files/` and links to those copies; if ICSI is unreachable the build continues and links to ICSI's original.
- **MCA** blocks automated requests (HTTP 403), so there is no MCA notifications feed; Companies Act links open fine in a browser.

- This is an internal tool: every page carries `noindex` and `robots.txt` disallows crawling. To restrict who can open it, turn on access protection in Vercel (or put it behind Cloudflare Access).
- Hand-written notes (key points, change notes, subject notes) live in `site/content.mjs` and are orientation summaries; the team works from the official PDF. A CS can optionally sign a set off in `CONTENT_REVIEWS` (name + date) to show "Reviewed by …". Change notes appear only on the document their link points to.

- `data/master-directions.json` is regenerated on every run — don't hand-edit it.
- This project is not affiliated with or endorsed by the Reserve Bank of India. Always verify against the official source before acting on it.

## License

MIT
