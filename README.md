# StuCred RegPulse — Compliance Register

A single-page application that scrapes and tracks RBI's Master Directions applicable to **Non-Banking Financial Companies - Investment and Credit Companies (NBFC-ICC)**. 

No backend, no server costs. A GitHub Action fetches latest regulations on a schedule, parses them into JSON, and commits them. The site is a static page that reads that JSON.

## How it works

```
scripts/fetch-master-directions.mjs  → fetches, parses, and filters NBFC directions to NBFC-ICC
data/master-directions.json           → the output the site reads (committed to the repo)
index.html                            → the UI (fetches ./data/master-directions.json, no server needed)
.github/workflows/update-feed.yml     → runs fetch script daily, commits updates
```

## Run it locally

```bash
npm install
npm run fetch              # pulls latest from RBI → data/master-directions.json
npm run serve              # preview at localhost
# or both:
npm start
```

**Daily auto-fetch on your Mac (no GitHub):** see `DEPLOY.md` — add a cron job for `scripts/daily-fetch.sh`.

**Put it online with a custom domain (free):** see `DEPLOY.md` (Vercel / Cloudflare Pages).

## Deploying to Production (GitHub Actions + Vercel)

1. Push this repository to GitHub.
2. Go to **Vercel** and import the repository. Vercel automatically deploys static directories with `index.html`.
3. In GitHub, go to **Settings → Actions → General → Workflow permissions** and select **Read and write permissions** (needed so the scheduled runner can commit `data/master-directions.json`).
4. Every day at 9:00 AM IST (or when manually run from the Actions tab), the GitHub Action fetches updates, commits them, and Vercel redeploys them automatically.

## Notes

- `data/master-directions.json` is regenerated on every run — don't hand-edit it.
- This project is not affiliated with or endorsed by the Reserve Bank of India. Always verify against the official source before acting on it.

## License

MIT
