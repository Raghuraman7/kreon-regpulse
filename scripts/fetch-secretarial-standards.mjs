// Periodically checks ICSI's Secretarial Standards for new or revised standards,
// comparing against data/secretarial-standards.json.
// ICSI revises these infrequently — run this MONTHLY, not in the 10-15 min
// watch-realtime.mjs loop. See package.json "fetch:secstandards" / "fetch:monthly".
//
// ICSI rebuilt icsi.edu as a JavaScript app in 2026: the old listing page
// (icsi.edu/knowledgebase/secretarial-standards/) and every .../publications/*.htm page
// now return the app shell or 404. The standards are listed on icsi.edu/member/icsi-standards,
// whose content the app loads as JSON from ICSI's own CMS endpoint (RESOLVE_URL below) —
// the "Secretarial Standards" tab there lists each standard with a direct PDF link.
// Run with: node scripts/fetch-secretarial-standards.mjs

import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { loadDataFile, writeDataFile } from "./lib/data-file.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { contentHash } from "./lib/change-detect.mjs";
import { isFreshRelease } from "./lib/date-utils.mjs";

const DATA_PATH = new URL("../data/secretarial-standards.json", import.meta.url);
const STANDARDS_PAGE_URL = "https://www.icsi.edu/member/icsi-standards";
const RESOLVE_URL = "https://webcms.icsi.edu/api/resolve/?path=%2Fmember%2Ficsi-standards";
const ISSUED_BY = "Institute of Company Secretaries of India (ICSI)";

// ICSI lists SS-1 and SS-2 by version ("Effective from 1st April, 2024" / "Applicable up to
// 31st March, 2024"), so their names come from here; other standards carry their name and
// code in the document title, e.g. "Secretarial Standard on Dividend (SS-3)".
const KNOWN_NAMES = {
  1: "Secretarial Standard on Meetings of the Board of Directors",
  2: "Secretarial Standard on General Meetings",
  3: "Secretarial Standard on Dividend",
  4: "Secretarial Standard on Report of the Board of Directors",
};

// Supporting documents in the same tab that are not standards themselves.
const NOT_A_STANDARD = /guidance|comparative|faq|charter|model (governance )?code|governance and compliance/i;

// Keys used before ICSI's redesign, so carefully written summaries carry over to the new
// "ss<N>" keys. Other pre-redesign entries (e.g. mis-scraped duplicates) are dropped.
const LEGACY_KEYS = {
  ss1: "ssonmeetingsofboardofdirectors",
  ss2: "ssgm",
  ss3: "ssondividend",
  ss4: "ssonregistersandrecords",
};

// Entries scraped from the old site link to .../webmodules/publications/*.htm, which no longer exists.
const isPreRedesign = (s) => /\/webmodules\/publications\//i.test(s.link || "");

function loadPreviousData() {
  return loadDataFile(DATA_PATH, { standards: [] });
}

async function fetchJsonWithRetry(url, retries = 3, backoffMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": STANDARDS_PAGE_URL,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
    }
  }
}

/** All document entries under the page's "Secretarial Standards" tab. */
function findStandardDocs(page) {
  const docs = [];
  const visit = (node, inTab) => {
    if (Array.isArray(node)) return node.forEach(n => visit(n, inTab));
    if (!node || typeof node !== "object") return;
    const tabHere = inTab || (typeof node.label === "string" && /^secretarial standards$/i.test(node.label.trim()));
    if (tabHere && Array.isArray(node.docs)) docs.push(...node.docs);
    for (const value of Object.values(node)) visit(value, tabHere);
  };
  visit(page, false);
  return docs.filter(d => d && typeof d.url === "string" && typeof d.title === "string");
}

/** "SS-3" etc., from the title or the PDF file name (ss-1-1-2024.pdf, ss3-...pdf, finalss-4.pdf). */
function standardNumber(doc) {
  const fromTitle = doc.title.match(/\bSS-?(\d{1,2})\b/i);
  if (fromTitle) return Number(fromTitle[1]);
  const file = doc.url.split("/").pop() || "";
  const fromFile = file.match(/ss-?(\d{1,2})(?=[^0-9]|$)/i);
  return fromFile ? Number(fromFile[1]) : null;
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** "Effective from 1st April, 2024" → "2024-04-01". */
function effectiveDateFrom(title) {
  const m = title.match(/effective\s+from\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/i);
  const month = m && MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** One entry per standard: the version in force (not the "Applicable up to …" one). */
function currentStandards(docs) {
  const byNumber = new Map();
  for (const doc of docs) {
    if (NOT_A_STANDARD.test(doc.title)) continue;
    const n = standardNumber(doc);
    if (!n) continue;
    const superseded = /applicable\s+up\s+to/i.test(doc.title);
    const existing = byNumber.get(n);
    if (!existing || (existing.superseded && !superseded)) byNumber.set(n, { n, doc, superseded });
  }
  return [...byNumber.values()].filter(s => !s.superseded).sort((a, b) => a.n - b.n);
}

function toStandard({ n, doc }, prev) {
  const name = KNOWN_NAMES[n] || doc.title.replace(/\s*\(SS-?\d+\)\s*$/i, "").trim();
  const versionNote = /effective\s+from/i.test(doc.title) ? doc.title.trim() : null;
  return {
    key: `ss${n}`,
    title: `${name} (SS-${n})`,
    issuedBy: ISSUED_BY,
    link: STANDARDS_PAGE_URL,
    pdfUrl: doc.url,
    effectiveDate: effectiveDateFrom(doc.title) || prev?.effectiveDate || null,
    lastAmended: versionNote || prev?.lastAmended || "See the official PDF for the effective date.",
    summary: prev?.summary && !/^Auto-discovered/i.test(prev.summary)
      ? prev.summary
      : `${name} (SS-${n}), as listed by ICSI.`,
    checkMeta: {
      amendedSignal: versionNote,
      contentHash: contentHash(JSON.stringify({ url: doc.url, title: doc.title, size: doc.size, date: doc.date })),
      lastCheckedAt: new Date().toISOString(),
    },
  };
}

export async function checkSecretarialStandards() {
  return withFileLock(DATA_PATH, runCheckSecretarialStandards);
}

async function runCheckSecretarialStandards() {
  console.log("🔍 Checking ICSI Secretarial Standards (icsi.edu/member/icsi-standards)...");

  const resolved = await fetchJsonWithRetry(RESOLVE_URL);
  const found = currentStandards(findStandardDocs(resolved?.page));
  console.log(`Found ${found.length} Secretarial Standard(s): ${found.map(s => `SS-${s.n}`).join(", ") || "none"}.`);

  const previousData = await loadPreviousData();
  const prevByKey = new Map(previousData.standards.map(s => [s.key, s]));
  const previousFor = (key) => prevByKey.get(key) || prevByKey.get(LEGACY_KEYS[key]);

  // No entry in the current "ss<N>" format yet means this is the first run on ICSI's new
  // site: establish a baseline instead of alerting on every standard as if it were new.
  const isBaselineRun = previousData.standards.every(isPreRedesign);

  assertNonZeroItems(found.length, previousData.standards.length, "Secretarial Standards");

  const nextStandards = [];
  const updates = [];
  for (const entry of found) {
    const prev = previousFor(`ss${entry.n}`);
    const next = toStandard(entry, prev);

    if (prev?.checkMeta?.lastAmendmentDetectedAt) {
      next.checkMeta.lastAmendmentDetectedAt = prev.checkMeta.lastAmendmentDetectedAt;
    }

    const isNew = !prev && !isBaselineRun;
    const isRevised = !isBaselineRun && prev?.key === next.key && prev.pdfUrl !== next.pdfUrl;
    if (isNew || isRevised) {
      console.log(`✨ ${isNew ? "New" : "Revised"} Secretarial Standard: ${next.title}`);
      next.checkMeta.lastAmendmentDetectedAt = new Date().toISOString();
      updates.push({
        id: `ss-${next.key}`,
        title: next.title,
        link: next.link,
        pdfUrl: next.pdfUrl,
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        summary: isNew
          ? "Newly listed Secretarial Standard on ICSI's standards page — please review and confirm applicability."
          : `ICSI published a new PDF for this standard${next.checkMeta.amendedSignal ? ` (${next.checkMeta.amendedSignal})` : ""}. Please verify what changed.`,
      });
    }
    nextStandards.push(next);
  }

  // A standard that disappears from ICSI's list is kept (last known version) for audit
  // history. Pre-redesign entries are not: their pages no longer exist.
  for (const prev of previousData.standards) {
    if (nextStandards.some(s => s.key === prev.key)) continue;
    if (!isPreRedesign(prev)) {
      console.warn(`⚠ ${prev.title} is no longer listed by ICSI; keeping the last known entry.`);
      nextStandards.push(prev);
    } else if (!Object.values(LEGACY_KEYS).includes(prev.key)) {
      console.log(`Dropping pre-redesign entry "${prev.title}" (${prev.key}): its page no longer exists.`);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    standards: nextStandards,
  };

  await writeDataFile(DATA_PATH, payload);
  console.log(`Wrote ${nextStandards.length} Secretarial Standards to data/secretarial-standards.json.`);

  const freshAlerts = updates.filter(u => isFreshRelease(u.date, 30));
  if (freshAlerts.length > 0) {
    console.log(`✨ Detected ${freshAlerts.length} Secretarial Standard update(s). Dispatching alert email...`);
    await sendRegulatoryAlert({
      source: "ICSI",
      category: "Secretarial Standard",
      updates: freshAlerts,
      categoryKey: "secretarialStandards",
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
