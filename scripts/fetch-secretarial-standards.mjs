// Periodically checks ICSI's Secretarial Standards page for new or revised standards
// (SS-1 and beyond), comparing against data/secretarial-standards.json.
// ICSI revises these infrequently — run this MONTHLY, not in the 10-15 min
// watch-realtime.mjs loop. See package.json "fetch:secstandards" / "fetch:monthly".
//
// Note: the URL referenced in older docs (icsi.edu/home/secretarial-standards/) now
// soft-404s. The live listing lives at icsi.edu/knowledgebase/secretarial-standards/,
// which links out to each individual standard's page — so instead of a hardcoded
// SS-1..SS-4 list, this scrapes that listing page for every standard link and tracks
// whatever it finds, the same way fetch-sebi-regulations.mjs dynamically discovers
// regulations instead of relying on a fixed array.
// Run with: node scripts/fetch-secretarial-standards.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractAmendmentSignal, contentHash } from "./lib/change-detect.mjs";

const DATA_PATH = new URL("../data/secretarial-standards.json", import.meta.url);
const SS_LISTING_URL = "https://www.icsi.edu/knowledgebase/secretarial-standards/";

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { standards: [] };
  }
}

async function fetchWithRetry(url, retries = 3, backoffMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
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

// Individual standard pages live under .../publications/<Name>.htm; the compendium
// (all standards bundled) and order-form pages link from the same folder but aren't
// a single standard, so they're excluded.
const STANDARD_LINK_PATTERN = /href=["']([^"']*\/media\/webmodules\/publications\/[^"']+\.htm)["']/gi;
const EXCLUDE_LINK_PATTERNS = [/compedium/i, /orderform/i];

// The pre-existing data/secretarial-standards.json was hand-curated with keys ss1/ss2/ss4,
// which don't match the keys this scraper derives from ICSI's real current URLs. Verified
// by fetching each page directly: ICSI's site now scopes "SS-4" to Registers & Records
// (the old "Board's Report" SS-4 entry appears superseded). Aliasing lets the migration
// merge into these instead of creating duplicate rows for the same standard.
const LEGACY_KEY_ALIASES = {
  ss1: "ssonmeetingsofboardofdirectors",
  ss2: "ssgm",
  ss4: "ssonregistersandrecords",
};

function deriveKeyFromUrl(url) {
  const fileMatch = url.match(/\/([^/]+)\.htm$/i);
  const raw = fileMatch ? fileMatch[1] : url;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function deriveFallbackTitle(url) {
  const key = deriveKeyFromUrl(url);
  return `ICSI Secretarial Standard (${key})`;
}

function extractTitle(html, url) {
  const m = html.match(/Secretarial\s+Standard\s+on\s+[^<\n]{3,80}/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return deriveFallbackTitle(url);
}

function extractPdfUrl(html, pageUrl) {
  const m = html.match(/href=["']?([^"'\s>]+\.pdf)["']?/i);
  if (!m) return null;
  try {
    return new URL(m[1].replace(/^http:/i, "https:"), pageUrl).href;
  } catch {
    return m[1];
  }
}

async function checkOneStandard(url, prev) {
  const res = await fetchWithRetry(url);
  const body = await res.text();

  const title = extractTitle(body, url) || prev?.title || deriveFallbackTitle(url);
  const amendedSignal = extractAmendmentSignal(body);
  const hash = contentHash(body);
  const pdfUrl = extractPdfUrl(body, url) || prev?.pdfUrl || null;

  return {
    key: deriveKeyFromUrl(url),
    title,
    issuedBy: "Institute of Company Secretaries of India (ICSI)",
    link: url,
    pdfUrl,
    effectiveDate: prev?.effectiveDate || null,
    lastAmended: amendedSignal || prev?.lastAmended || "See linked standard for effective date.",
    summary: prev?.summary || `Auto-discovered from the ICSI Secretarial Standards listing page: ${title}.`,
    checkMeta: {
      amendedSignal,
      contentHash: hash,
      lastCheckedAt: new Date().toISOString(),
    },
  };
}

function hasChanged(prev, next) {
  if (!prev?.checkMeta) return false; // first time we've checked this standard — establish baseline only
  if (next.checkMeta.amendedSignal && prev.checkMeta.amendedSignal) {
    return next.checkMeta.amendedSignal !== prev.checkMeta.amendedSignal;
  }
  return next.checkMeta.contentHash !== prev.checkMeta.contentHash;
}

export async function checkSecretarialStandards() {
  return withFileLock(DATA_PATH, runCheckSecretarialStandards);
}

async function runCheckSecretarialStandards() {
  console.log("🔍 Checking ICSI Secretarial Standards listing page...");

  const listingRes = await fetchWithRetry(SS_LISTING_URL);
  const listingHtml = await listingRes.text();

  const rawLinks = [...listingHtml.matchAll(STANDARD_LINK_PATTERN)].map(m => m[1]);
  const links = [...new Set(rawLinks)]
    .map(href => new URL(href, SS_LISTING_URL).href)
    .filter(url => !EXCLUDE_LINK_PATTERNS.some(p => p.test(url)));

  console.log(`Found ${links.length} individual Secretarial Standard link(s) on the listing page.`);

  const previousData = await loadPreviousData();
  const prevByKey = new Map();
  for (const s of previousData.standards) {
    prevByKey.set(s.key, s);
    const aliasedKey = LEGACY_KEY_ALIASES[s.key];
    if (aliasedKey) prevByKey.set(aliasedKey, s);
  }

  // First time this scraper runs against a hand-curated file, none of the existing
  // entries will have checkMeta yet — treat that as baseline-establishing rather than
  // alerting on every standard as if it were brand new.
  const isFirstEverRun = previousData.standards.every(s => !s.checkMeta);

  const nextStandards = [];
  const updates = [];
  let successCount = 0;

  for (const url of links) {
    const key = deriveKeyFromUrl(url);
    const prev = prevByKey.get(key);
    try {
      const checked = await checkOneStandard(url, prev);
      successCount++;

      if (!prev && !isFirstEverRun) {
        console.log(`✨ New ICSI Secretarial Standard discovered: ${checked.title}`);
        updates.push({
          id: `ss-${key}`,
          title: checked.title,
          link: checked.link,
          pdfUrl: checked.pdfUrl,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          summary: `Newly discovered Secretarial Standard on the ICSI listing page — please review and confirm applicability.`,
        });
      } else if (prev && hasChanged(prev, checked)) {
        console.log(`✨ Revision detected in ${checked.title}`);
        updates.push({
          id: `ss-${key}`,
          title: checked.title,
          link: checked.link,
          pdfUrl: checked.pdfUrl,
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          summary: checked.checkMeta.amendedSignal
            ? `Amendment indicator changed: "${prev.checkMeta?.amendedSignal || prev.lastAmended}" → "${checked.checkMeta.amendedSignal}"`
            : `Source page content changed since the last check on ${prev.checkMeta?.lastCheckedAt?.slice(0, 10) || "an earlier date"}. Please verify what changed.`,
        });
      }

      nextStandards.push(checked);
    } catch (err) {
      console.error(`Error checking standard at ${url}:`, err.message);
      // Keep the last-known-good entry rather than dropping it, re-keyed to the new
      // URL-derived key so it isn't duplicated by the orphan-preservation pass below.
      if (prev) nextStandards.push({ ...prev, key });
    }
  }

  // Standards previously tracked whose link disappeared from the listing page entirely
  // (superseded/withdrawn) are kept as-is rather than silently deleted, for audit history.
  for (const prev of previousData.standards) {
    const mergedKey = LEGACY_KEY_ALIASES[prev.key] || prev.key;
    if (!nextStandards.some(s => s.key === mergedKey)) {
      nextStandards.push(prev);
    }
  }

  assertNonZeroItems(successCount, previousData.standards.length, "Secretarial Standards");

  const payload = {
    generatedAt: new Date().toISOString(),
    standards: nextStandards,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${nextStandards.length} Secretarial Standards entries to data/secretarial-standards.json (${successCount} checked successfully).`);

  if (updates.length > 0) {
    console.log(`✨ Detected ${updates.length} Secretarial Standard update(s). Dispatching alert email...`);
    await sendRegulatoryAlert({
      source: "ICSI",
      category: "Secretarial Standard",
      updates,
      categoryKey: "secretarialStandards"
    });
  } else {
    console.log("No Secretarial Standards updates detected.");
  }

  return updates;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-secretarial-standards.mjs")) {
  checkSecretarialStandards().catch(err => {
    console.error("Fatal error in checkSecretarialStandards:", err);
    process.exit(1);
  });
}
