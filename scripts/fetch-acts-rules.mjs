// Periodically checks India Code / MCA / RBI / SEBI / MeitY source pages for amendments
// to the Acts & Rules already tracked in data/acts-rules.json.
// Acts change at Parliament's pace, not RBI/SEBI's — run this MONTHLY, not in the
// 10-15 min watch-realtime.mjs loop. See package.json "fetch:acts" / "fetch:monthly".
// Run with: node scripts/fetch-acts-rules.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractAmendmentSignal, contentHash } from "./lib/change-detect.mjs";

const DATA_PATH = new URL("../data/acts-rules.json", import.meta.url);

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { acts: [] };
  }
}

async function fetchWithRetry(url, retries = 3, backoffMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
    }
  }
}

async function checkOneAct(act) {
  const res = await fetchWithRetry(act.link);
  const body = await res.text();
  const lastModifiedHeader = res.headers.get("last-modified");

  const amendedSignal = extractAmendmentSignal(body);
  const hash = contentHash(body);

  return {
    ...act,
    checkMeta: {
      amendedSignal,
      contentHash: hash,
      sourceLastModified: lastModifiedHeader || null,
      lastCheckedAt: new Date().toISOString(),
    },
  };
}

function hasChanged(prevAct, nextAct) {
  const prevMeta = prevAct?.checkMeta;
  if (!prevMeta) return false; // no baseline yet — first check for this act, don't alert
  if (nextAct.checkMeta.amendedSignal && prevMeta.amendedSignal) {
    return nextAct.checkMeta.amendedSignal !== prevMeta.amendedSignal;
  }
  return nextAct.checkMeta.contentHash !== prevMeta.contentHash;
}

export async function checkActsAndRules() {
  return withFileLock(DATA_PATH, runCheckActsAndRules);
}

async function runCheckActsAndRules() {
  console.log("🔍 Checking Acts & Rules sources (India Code / MCA / RBI / SEBI / MeitY)...");

  const previousData = await loadPreviousData();
  const prevByLink = new Map(previousData.acts.map(a => [a.link, a]));

  const nextActs = [];
  const updatedActs = [];
  let successCount = 0;

  for (const act of previousData.acts) {
    try {
      const checked = await checkOneAct(act);
      successCount++;

      const prev = prevByLink.get(act.link);
      // Carry forward an earlier-this-month detection so an incidental re-run (e.g.
      // workflow_dispatch) doesn't erase it before the monthly digest gets to read it.
      if (prev?.checkMeta?.lastAmendmentDetectedAt) {
        checked.checkMeta.lastAmendmentDetectedAt = prev.checkMeta.lastAmendmentDetectedAt;
      }
      if (hasChanged(prev, checked)) {
        console.log(`✨ Amendment detected in ${act.title}`);
        const newLastAmended = checked.checkMeta.amendedSignal || checked.lastAmended;
        checked.lastAmended = newLastAmended;
        // Recorded so the monthly digest (which runs on its own end-of-month cron,
        // separate from this check) can find "amended this calendar month" — lastAmended
        // itself is often free text like "Amended regularly via MCA notifications" with
        // no parseable date, so it can't be used for that.
        checked.checkMeta.lastAmendmentDetectedAt = new Date().toISOString();
        updatedActs.push({
          id: act.id,
          title: act.title,
          link: act.link,
          pdfUrl: act.pdfUrl,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          summary: checked.checkMeta.amendedSignal
            ? `Amendment indicator changed: "${prev.checkMeta?.amendedSignal || act.lastAmended}" → "${checked.checkMeta.amendedSignal}"`
            : `Source page content changed since the last check on ${prev.checkMeta?.lastCheckedAt?.slice(0, 10) || "an earlier date"}. No explicit "last amended" text was found — please verify what changed on the source page.`,
        });
      }

      nextActs.push(checked);
    } catch (err) {
      console.error(`Error checking ${act.title}:`, err.message);
      nextActs.push(act); // keep last-known-good entry so it isn't dropped from the register
    }
  }

  assertNonZeroItems(successCount, previousData.acts.length, "Acts & Rules");

  const payload = {
    generatedAt: new Date().toISOString(),
    acts: nextActs,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${nextActs.length} Acts & Rules entries to data/acts-rules.json (${successCount} checked successfully).`);

  if (updatedActs.length > 0) {
    console.log(`✨ Detected ${updatedActs.length} Act/Rule amendment(s). Dispatching alert email...`);
    await sendRegulatoryAlert({
      source: "MCA",
      category: "Act/Rule Amendment",
      updates: updatedActs,
      categoryKey: "actsRules"
    });
  } else {
    console.log("No Acts & Rules amendments detected.");
  }

  return updatedActs;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-acts-rules.mjs")) {
  checkActsAndRules().catch(err => {
    console.error("Fatal error in checkActsAndRules:", err);
    process.exit(1);
  });
}
