// Periodically checks India Code / MCA / RBI / SEBI / MeitY source pages for amendments
// to the Acts & Rules already tracked in data/acts-rules.json.
// Acts change at Parliament's pace, not RBI/SEBI's — run this MONTHLY, not in the
// 10-15 min watch-realtime.mjs loop. See package.json "fetch:acts" / "fetch:monthly".
// Run with: node scripts/fetch-acts-rules.mjs

import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { loadDataFile, writeDataFile } from "./lib/data-file.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractAmendmentSignal, contentHash } from "./lib/change-detect.mjs";
import { extractDateString, isFreshRelease } from "./lib/date-utils.mjs";

const DATA_PATH = new URL("../data/acts-rules.json", import.meta.url);

function loadPreviousData() {
  return loadDataFile(DATA_PATH, { acts: [] });
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
  // Bot-protection and maintenance pages can come back as HTTP 200; treat them as a
  // failed check so the caller keeps the last-known-good entry.
  if (/access denied|captcha|request rejected|under maintenance|service unavailable/i.test(body.slice(0, 5000))) {
    throw new Error(`Blocked or maintenance page returned for ${act.link}`);
  }
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

  // If nextAct has an explicit amendment signal and it differs from previous
  // A new signal only counts when it reads as a date; stray text such as "effective from
  // the date of publication" on an unrelated page would otherwise overwrite lastAmended.
  if (nextAct.checkMeta.amendedSignal && extractDateString(nextAct.checkMeta.amendedSignal)) {
    return nextAct.checkMeta.amendedSignal !== prevMeta.amendedSignal;
  }

  // If source last-modified header changed
  if (nextAct.checkMeta.sourceLastModified && prevMeta.sourceLastModified) {
    return nextAct.checkMeta.sourceLastModified !== prevMeta.sourceLastModified;
  }

  return false;
}

export async function checkActsAndRules() {
  return withFileLock(DATA_PATH, runCheckActsAndRules);
}

async function runCheckActsAndRules() {
  console.log("🔍 Checking Acts & Rules sources (India Code / MCA / RBI / SEBI / MeitY)...");

  const previousData = await loadPreviousData();
  // The Acts list is curated in this file, not scraped; with no entries there is nothing
  // to check, and writing would commit an empty register.
  if (previousData.acts.length === 0) {
    throw new Error("data/acts-rules.json has no acts. Restore it from git before running this check.");
  }
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
      // Keep the last good signal when this page gave none (or no date), so the baseline
      // survives one odd page and the next normal run doesn't re-alert.
      const prevSignal = prev?.checkMeta?.amendedSignal;
      if (prevSignal && !extractDateString(checked.checkMeta.amendedSignal || "")) {
        checked.checkMeta.amendedSignal = prevSignal;
      }
      if (hasChanged(prev, checked)) {
        console.log(`✨ Amendment detected in ${act.title}`);
        const newLastAmended = checked.checkMeta.amendedSignal || checked.lastAmended;
        checked.lastAmended = newLastAmended;
        checked.checkMeta.lastAmendmentDetectedAt = new Date().toISOString();
        const extractedDate = extractDateString(checked.checkMeta.amendedSignal) || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        updatedActs.push({
          id: act.id,
          title: act.title,
          link: act.link,
          pdfUrl: act.pdfUrl,
          date: extractedDate,
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

  await writeDataFile(DATA_PATH, payload);
  console.log(`Wrote ${nextActs.length} Acts & Rules entries to data/acts-rules.json (${successCount} checked successfully).`);

  const freshAlerts = updatedActs.filter(a => isFreshRelease(a.date, 30));

  if (freshAlerts.length > 0) {
    console.log(`✨ Detected ${freshAlerts.length} Act/Rule amendment(s). Dispatching alert email...`);
    await sendRegulatoryAlert({
      source: "MCA",
      category: "Act/Rule Amendment",
      updates: freshAlerts,
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
