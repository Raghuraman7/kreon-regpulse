# Deploy Kreon RegPulse (free, no paid services)

Kreon RegPulse is a static site built from `data/*.json` by `npm run build` into `dist/`. You can host it for **$0** and point a custom domain at it.

## 1. Refresh data (manual or daily automatic)

**Manual (any time):**

```bash
npm install
npm run fetch          # updates JSON data from RBI & SEBI
npm run build          # writes the site to dist/
npm run serve          # open the printed local URL
```

**One command (fetch + preview):**

```bash
npm start
```

**Automatic daily fetch on your Mac (no GitHub needed):**

```bash
chmod +x scripts/daily-fetch.sh
crontab -e
```

Add this line (runs every day at **9:00 AM IST**):

```
0 9 * * * /Users/raghu/Code/rbi-compliance-tracker/scripts/daily-fetch.sh >> /tmp/regpulse-fetch.log 2>&1
```

Adjust the path if the project lives elsewhere. Your Mac must be on (or awake) at 9 AM for cron to run.

**Check it worked:** `cat /tmp/regpulse-fetch.log`

**Important:** This updates the data on your machine only. To refresh the **live website** automatically too, use GitHub Actions (see Option C below) so fetch + deploy happen in the cloud.

---

## 1b. Process supervision for the real-time watcher (`watch-realtime.mjs`)

> **Who sends emails:** alert and digest emails go out from the GitHub Action only. Local runs (the watcher, `npm run fetch`, a cron job) update the data but don't email, so the same release is never sent twice. To send from a machine instead, set `ALERTS_FROM_THIS_MACHINE=1` in its `.env` **and** remove the SMTP secrets from the GitHub workflows. Every alert sent is recorded in `data/sent-alerts.json`, and a release already listed there is never emailed again.

`npm run watch` runs the continuous daemon in the foreground — if it crashes or the machine reboots, nothing brings it back. Use [pm2](https://pm2.keymetrics.io/) to auto-restart it.

```bash
npm install -g pm2
npm install                 # make sure proper-lockfile etc. are installed
pm2 start ecosystem.config.cjs
pm2 save                    # persist the process list
pm2 startup                 # prints a command to run once, so pm2 restarts on reboot
```

Useful commands:

```bash
pm2 logs kreon-regpulse-watch     # tail logs (also written to logs/watch-*.log)
pm2 restart kreon-regpulse-watch
pm2 stop kreon-regpulse-watch
pm2 status
```

`ecosystem.config.cjs` restarts the process on crash (up to 20 times, with backoff) and requires it to stay up 30s before counting as a successful start. Env vars (SMTP, `EMAIL_RECIPIENTS`, `DEV_OPS_RECIPIENTS`, `POLL_INTERVAL_MS`, `ACTIVE_HOURS_START/END`) still come from `.env` — pm2 doesn't need to know about them separately.

---

## 2. Put it online (pick one — all free)

After `npm run fetch && npm run build`, upload the **`dist/` folder**. It contains every page, the assets and the search index.

### Option A — Cloudflare Pages (recommended)

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com) (free).
2. **Create a project** → **Direct Upload** → drag the `dist/` folder. (Or connect Git with build command `npm run build` and output directory `dist`.)
3. You get a URL like `https://regpulse-abc.pages.dev`.
4. **Custom domain:** Pages → your project → **Custom domains** → add e.g. `rbi.yourdomain.com`.
5. In your domain registrar (or Cloudflare DNS), add the CNAME Cloudflare shows you.

Re-upload (or use Wrangler CLI later) whenever you run `npm run fetch` and want fresh data live.

### Option B — Vercel (ideal for Git integration)

Vercel is extremely easy to host static sites on:
1. Go to [vercel.com](https://vercel.com) and link your GitHub account.
2. Select your repository `rbi-compliance-tracker` and click **Deploy**.
3. `vercel.json` tells Vercel to run `npm run build` and serve `dist/`. If the project was created before this, check **Settings → Build & Development** has no overrides that conflict.
4. On every push to your repository (including commits from GitHub Actions), Vercel automatically redeploys.

### Option C — GitHub Pages

1. Push repo to GitHub.
2. **Settings → Pages** → source **GitHub Actions**, with a workflow that runs `npm ci && npm run build` and uploads `dist/`.
3. Enable **Actions → Read and write** so the daily workflow can commit data updates.
4. Custom domain: add `CNAME` file or Pages domain settings.

The workflow in `.github/workflows/update-feed.yml` already refreshes data **once daily at 9:00 AM IST** and on manual trigger from the Actions tab.

---

## 3. Custom domain checklist

1. Buy a domain from Namecheap, GoDaddy, Cloudflare Registrar, etc.
2. In Vercel/Cloudflare/Pages, add the custom hostname.
3. At your DNS provider, create the **CNAME** (or A records) they specify.
4. Wait 5–30 minutes for DNS; HTTPS is automatic.

---

## 4. What it does

- **RBI opens first** (`/` shows RBI Master Directions; change `LANDING_REGISTER` in `site/build.mjs` to pick another section)
- **Notifications**: the last 12 months of updates from RBI, SEBI, Acts & Rules and Standards in one feed, newest first, grouped by month, with a Show filter per provider and an "Older updates" page
- **Sections like the old tabs**: RBI (Master Directions | Notifications), SEBI (Regulations | Circulars), Acts & Rules, Secretarial Standards, with subject filters on RBI Master Directions
- **A page per document** with a **Brief** (what changed → who it applies to → dates → key points → sources), "Amended by / Amends" links between RBI directions and their amending notifications; it prints cleanly for files and board notes
- **Search box in the header** of every page
- **Search** (Pagefind, static index) with register, topic, date and NBFC filters and CSV export
- **SBR applicability** shown on every RBI Master Direction
- Zero JavaScript outside the search page; light and dark mode; works from 280px phones to 4K
