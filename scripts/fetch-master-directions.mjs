// Fetches RBI Master Directions for Non-Banking Financial Companies (NBFC-ICC)
// from https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411
// Parses the HTML and extracts direction titles, dates, links, and PDF links.
// Compares with stored state to detect updates and send email notifications.
// Run with: node scripts/fetch-master-directions.mjs

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";

const OUTPUT_PATH = new URL("../data/master-directions.json", import.meta.url);
const NBFC_PAGE_URL = "https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411";
const BASE_URL = "https://www.rbi.org.in/Scripts/";

/**
 * Parse a date string like "Nov 28, 2025" to ISO string.
 */
function parseRBIDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d) ? str.trim() : d.toISOString();
}

/**
 * Load previous state
 */
async function loadPreviousData() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { directions: [] };
  }
}

/**
 * Extract Master Directions entries from RBI's NBFC page HTML.
 */
function parseDirectionsFromViewstate(html) {
  const vsMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
  if (!vsMatch) return [];

  const vsBase64 = vsMatch[1];
  let vsDecoded;
  try {
    vsDecoded = Buffer.from(vsBase64, "base64").toString("utf-8");
  } catch {
    return [];
  }

  const rows = [];
  const tableContent = vsDecoded;

  const linkRegex = /<a\s+class="link2"\s+href=([^>]+)>\s*([\s\S]*?)<\/a>/g;
  const dateHeaderRegex = /<b>((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})<\/b>/g;
  const pdfLinkRegex = /href='(https:\/\/rbidocs\.rbi\.org\.in\/[^']+\.PDF)'/g;

  const dates = [];
  let dm;
  while ((dm = dateHeaderRegex.exec(tableContent)) !== null) {
    dates.push({ index: dm.index, date: dm[1] });
  }

  const pdfLinks = [];
  let pm;
  while ((pm = pdfLinkRegex.exec(tableContent)) !== null) {
    pdfLinks.push({ index: pm.index, url: pm[1] });
  }

  let lm;
  let dirIndex = 0;
  while ((lm = linkRegex.exec(tableContent)) !== null) {
    const rawHref = lm[1].trim();
    const title = lm[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    let link;
    if (rawHref.startsWith("http")) {
      link = rawHref;
    } else {
      link = BASE_URL + rawHref.replace(/^\./, "");
    }

    let dateStr = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i].index < lm.index) {
        dateStr = dates[i].date;
        break;
      }
    }

    let pdfUrl = null;
    for (const pl of pdfLinks) {
      if (pl.index > lm.index) {
        pdfUrl = pl.url;
        break;
      }
    }

    if (title && title.length > 5) {
      rows.push({
        id: `md-${dirIndex++}`,
        title,
        link,
        pdfUrl: pdfUrl || null,
        issuedDate: parseRBIDate(dateStr),
        issuedDateRaw: dateStr || null,
      });
    }
  }

  return rows;
}

const EXCLUDE_PATTERNS = [
  /peer.to.peer/i,
  /p2p/i,
  /account.aggregator/i,
  /microfinance/i,
  /\bMFI\b/,
  /housing.finance/i,
  /\bHFC\b/,
  /core.investment/i,
  /\bCIC\b/,
  /standalone.primary.dealer/i,
  /\bSPD\b/,
  /non-operative.financial.holding/i,
  /\bNOFHC\b/,
  /mortgage.guarantee/i,
];

function isNBFCICCApplicable(title) {
  for (const pat of EXCLUDE_PATTERNS) {
    if (pat.test(title)) return false;
  }
  return true;
}

export async function checkRbiMasterDirections() {
  console.log("🔍 Checking RBI Master Directions...");

  const res = await fetch(NBFC_PAGE_URL, {
    headers: {
      "User-Agent": "rbi-compliance-tracker/1.0 (open source; CS/compliance teams)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${NBFC_PAGE_URL}`);
  }

  const html = await res.text();
  const allDirections = parseDirectionsFromViewstate(html);

  // Filter to NBFC-ICC applicable directions
  const nbfcIccDirections = allDirections
    .filter((d) => isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "NBFC-ICC" }));

  const excludedDirections = allDirections
    .filter((d) => !isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "Other NBFC sub-type" }));

  console.log(`NBFC-ICC applicable: ${nbfcIccDirections.length}`);

  // Compare with previous state to detect updates
  const previousData = await loadPreviousData();
  const updatedDirs = [];

  nbfcIccDirections.forEach(dir => {
    const prev = previousData.directions.find(p => p.link === dir.link);
    if (!prev) {
      console.log(`✨ New RBI Master Direction detected: ${dir.title}`);
      updatedDirs.push(dir);
    } else if (prev.title !== dir.title) {
      console.log(`✨ Updated RBI Master Direction title detected: ${dir.title}`);
      updatedDirs.push(dir);
    }
  });

  if (nbfcIccDirections.length === 0) {
    throw new Error("RBI Scraper parsed 0 items. RBI page layout may have changed.");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceUrl: NBFC_PAGE_URL,
    category: "NBFC-ICC",
    categoryDescription:
      "Investment and Credit Companies — the residual NBFC category.",
    count: nbfcIccDirections.length,
    directions: nbfcIccDirections,
    excluded: excludedDirections,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(
    `Wrote ${nbfcIccDirections.length} NBFC-ICC directions to data/master-directions.json`
  );

  if (updatedDirs.length > 0 && previousData.directions.length > 0) {
    console.log(`✨ Detected ${updatedDirs.length} updated RBI Master Direction(s). (Real-time email notification disabled)`);
  } else {
    console.log("No new RBI Master Direction updates detected.");
  }

  return updatedDirs;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-master-directions.mjs")) {
  checkRbiMasterDirections().catch((err) => {
    console.error("Fatal error in checkRbiMasterDirections:", err);
    process.exit(1);
  });
}

