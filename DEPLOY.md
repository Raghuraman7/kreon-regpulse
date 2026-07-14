# Deploy Kreon RegPulse (free, no paid services)

Kreon RegPulse is a static site: `index.html` + `data/master-directions.json` + `data/sebi-regulations.json`. You can host it for **$0** and point a custom domain at it.

## 1. Refresh data (manual or daily automatic)

**Manual (any time):**

```bash
npm install
npm run fetch          # updates JSON data from RBI & SEBI
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

## 2. Put it online (pick one — all free)

After `npm run fetch`, upload the **project root** (not `node_modules`):

| What to upload | Files |
|---|---|
| Site | `index.html` |
| Data | `data/master-directions.json`, `data/sebi-regulations.json` |
| Optional | `README.md`, `LICENSE` |

### Option A — Cloudflare Pages (recommended)

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com) (free).
2. **Create a project** → **Direct Upload** → drag the folder (or zip of the files above).
3. You get a URL like `https://regpulse-abc.pages.dev`.
4. **Custom domain:** Pages → your project → **Custom domains** → add e.g. `rbi.yourdomain.com`.
5. In your domain registrar (or Cloudflare DNS), add the CNAME Cloudflare shows you.

Re-upload (or use Wrangler CLI later) whenever you run `npm run fetch` and want fresh data live.

### Option B — Vercel (ideal for Git integration)

Vercel is extremely easy to host static sites on:
1. Go to [vercel.com](https://vercel.com) and link your GitHub account.
2. Select your repository `rbi-compliance-tracker` and click **Deploy**.
3. Vercel automatically deploys the repository directory as a static site (since it contains `index.html`).
4. On every push to your repository (including commits from GitHub Actions), Vercel automatically redeploys.

### Option C — GitHub Pages

1. Push repo to GitHub.
2. **Settings → Pages** → deploy from `main`, root `/`.
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

- **One page** instead of browsing the main RBI or SEBI sites
- **Filters** by categories like Capital Adequacy, NPA/Provisioning, Governance, KYC, etc.
- **Search** by direction title or topic with real-time keyword highlighting
- **SBR applicability badges** for easy layer-based checks
- **Descriptive summaries** to read policies at a glance
- **Quick View** buttons with instant fallbacks to open PDFs cleanly
