// Fetches latest SEBI Circulars from SEBI website
// URL: https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0
// Saves output to data/sebi-circulars.json
// Triggers real-time email alerts via email-notifier.mjs when new circulars are released.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractDateString, isFreshRelease } from "./lib/date-utils.mjs";

const DATA_PATH = new URL("../data/sebi-circulars.json", import.meta.url);
const SEBI_CIRCULAR_LIST_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0";

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastChecked: null, circulars: [] };
  }
}

async function fetchWithRetry(url, retries = 3, backoffMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
    }
  }
}

async function fetchPage(url) {
  return await fetchWithRetry(url);
}

/**
 * Extract detail information for a SEBI circular
 */
async function fetchCircularDetails(url) {
  try {
    const html = await fetchPage(url);

    // Title
    const h1Match = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

    // Date
    const date = extractDateString(html);

    // PDF URL
    const pdfMatch = html.match(/iframe\s+src=\x27[^\x27]*?file=([^\x27&]+)/i) ||
                     html.match(/href=["\x27]?([^"\x27\s>]+\.pdf)/i);
    const pdfUrl = pdfMatch ? decodeURIComponent(pdfMatch[1]) : null;

    // Circular Number or Department
    const deptMatch = html.match(/class=\x27dept_value\x27[^>]*>\s*<h5>([^<]+)<\/h5>/i);
    const department = deptMatch ? deptMatch[1].trim() : null;

    let finalPdfUrl = pdfUrl;
    if (finalPdfUrl && !finalPdfUrl.startsWith("http")) {
      finalPdfUrl = new URL(finalPdfUrl, "https://www.sebi.gov.in").href;
    }

    const isNbfcRelevant = isApplicableToNbfc(title, department);

    return { title, date, pdfUrl: finalPdfUrl, department, isNbfcRelevant };
  } catch (err) {
    console.warn(`Failed to fetch details for SEBI circular ${url}:`, err.message);
    return { title: "", date: null, pdfUrl: null, department: null, isNbfcRelevant: false };
  }
}

const APPLICABLE_KEYWORDS = [
  /\bnbfc\b/i,
  /non.banking financial/i,
  /digital lending/i,
  /lending service provider/i,
  /\blsp\b/i,
  /digital lending app/i,
  /\bdla\b/i,
  /peer.to.peer lending/i,
  /credit rating agenc/i,
  /\bcra\b/i,
  /credit information compan/i,
  /\bcic\b/i,
  /\bkyc\b/i,
  /know your customer/i,
  /anti.money laundering/i,
  /\baml\b/i,
  /\bcft\b/i,
  /first loss default guarantee/i,
  /\bflgd\b/i,
  /co-lending/i,
  /securitisation/i,
  /securitization/i,
  /non-convertible debenture/i,
  /\bncd\b/i
];

const EXCLUDE_KEYWORDS = [
  /mutual fund/i,
  /alternative investment fund/i,
  /\baif\b/i,
  /stock broker/i,
  /trading member/i,
  /clearing member/i,
  /portfolio manager/i,
  /investment advis/i,
  /research analyst/i,
  /foreign portfolio investor/i,
  /\bfpi\b/i,
  /custodian/i,
  /merchant banker/i,
  /vault manager/i,
  /index provider/i,
  /commodity derivative/i
];

function isApplicableToNbfc(title, department) {
  const t = title || "";
  const d = department || "";

  // 1. If it explicitly contains exclude keywords, exclude it
  for (const pattern of EXCLUDE_KEYWORDS) {
    if (pattern.test(t) || pattern.test(d)) {
      return false;
    }
  }

  // 2. MIRSD (Market Intermediaries Regulation and Supervision Department) registers/oversees Credit Rating Agencies
  const lowerDept = d.toLowerCase();
  if (lowerDept.includes("market intermediaries") || lowerDept.includes("mirsd")) {
    return true;
  }

  // 3. Check NBFC/digital-lending relevant keywords
  for (const pattern of APPLICABLE_KEYWORDS) {
    if (pattern.test(t)) {
      return true;
    }
  }

  // 4. Default to false to focus exclusively on NBFC/digital-lending relevant circulars
  return false;
}

export async function checkSebiCirculars() {
  return withFileLock(DATA_PATH, runCheckSebiCirculars);
}

async function runCheckSebiCirculars() {
  console.log("🔍 Checking SEBI Circulars...");
  const html = await fetchPage(SEBI_CIRCULAR_LIST_URL);

  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/circulars\/[^"]+)"/gi)];
  console.log(`Found ${linkMatches.length} raw SEBI circular links on listing page.`);

  const previousData = await loadPreviousData();
  assertNonZeroItems(linkMatches.length, previousData.circulars.length, "SEBI Circulars");
  const prevUrls = new Set(previousData.circulars.map(c => c.link));
  const unparsedMatches = linkMatches.filter(m => !prevUrls.has(m[1]));
  const newCirculars = [];

  if (unparsedMatches.length > 0) {
    console.log(`⚡ Concurrently checking ${unparsedMatches.length} new SEBI circular details...`);
    
    // Batch processing helper: processes up to 4 items concurrently
    const BATCH_SIZE = 4;
    for (let i = 0; i < unparsedMatches.length; i += BATCH_SIZE) {
      const chunk = unparsedMatches.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        chunk.map(async (m) => {
          const url = m[1];
          const idMatch = url.match(/_(\d+)\.html$/i);
          const id = idMatch ? `sebi-circ-${idMatch[1]}` : url;

          const details = await fetchCircularDetails(url);
          if (!details.isNbfcRelevant) {
            console.log(`ℹ️ Skipping SEBI Circular (not NBFC/digital-lending relevant): ${details.title || url}`);
            return null;
          }

          console.log(`✨ New SEBI Circular detected (NBFC/digital-lending relevant): ${details.title || url}`);
          return {
            id,
            link: url,
            title: details.title || "SEBI Circular",
            date: details.date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            pdfUrl: details.pdfUrl,
            department: details.department,
            summary: details.title ? `Circular issued by SEBI: ${details.title}` : "New SEBI Circular released.",
            detectedAt: new Date().toISOString()
          };
        })
      );

      results.forEach(res => {
        if (res) newCirculars.push(res);
      });
    }
  }

  // Combine and update stored data
  const updatedList = [
    ...newCirculars,
    ...previousData.circulars.filter(p => !newCirculars.some(n => n.id === p.id))
  ].slice(0, 100);

  const payload = {
    lastChecked: new Date().toISOString(),
    count: updatedList.length,
    circulars: updatedList
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`Updated data/sebi-circulars.json (${updatedList.length} total items).`);

  // Only dispatch instant alerts for circulars released today / within last 2 days,
  // ensuring older historical or cached circulars never send emails.
  const freshAlerts = newCirculars.filter(c => isFreshRelease(c.date, 2));

  if (freshAlerts.length > 0 && previousData.circulars.length > 0) {
    console.log(`✨ Detected ${freshAlerts.length} fresh SEBI circular(s) issued today. Dispatching instant email alert...`);
    await sendRegulatoryAlert({
      source: "SEBI",
      category: "Circular",
      updates: freshAlerts,
      categoryKey: "sebiCirculars"
    });
  } else if (newCirculars.length > 0 && freshAlerts.length === 0) {
    console.log(`ℹ️ ${newCirculars.length} cached/historical SEBI circular(s) updated in database (no email sent).`);
  } else if (previousData.circulars.length === 0) {
    console.log("Initialized SEBI circulars baseline data.");
  } else {
    console.log("No new SEBI circulars detected.");
  }

  return newCirculars;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-sebi-circulars.mjs")) {
  checkSebiCirculars().catch(err => {
    console.error("Fatal error in checkSebiCirculars:", err);
    process.exit(1);
  });
}
