// Fetches RBI Master Directions for Non-Banking Financial Companies (NBFC-ICC)
// from https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411
// Parses the HTML and extracts direction titles, dates, links, and PDF links.
// Run with: node scripts/fetch-master-directions.mjs

import { writeFile, mkdir } from "node:fs/promises";

const OUTPUT_PATH = new URL("../data/master-directions.json", import.meta.url);

// NBFC-ICC categories — Master Directions applicable to NBFC-ICC
// These are identified by the "Investment and Credit Company" category
// Under the RBI's Scale Based Regulation, NBFC-ICC is a category that covers
// investment & credit companies (most common NBFC type).
// The NBFC directions at did=411 include cross-cutting rules applicable to NBFC-ICC.

const NBFC_PAGE_URL =
  "https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411";
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
 * Extract Master Directions entries from RBI's NBFC page HTML.
 * The page embeds all data in a __VIEWSTATE blob + rendered HTML table.
 * We decode the rendered table from the VIEWSTATE value.
 */
function parseDirectionsFromViewstate(html) {
  // Extract __VIEWSTATE value
  const vsMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
  if (!vsMatch) return [];

  // Decode base64
  const vsBase64 = vsMatch[1];
  let vsDecoded;
  try {
    vsDecoded = Buffer.from(vsBase64, "base64").toString("utf-8");
  } catch {
    return [];
  }

  // The viewstate contains HTML for the table rows — extract it
  // The pattern we're looking for: <td><a class="link2" href=...>title</a></td>
  const rows = [];
  // Match table-header rows (category/date labels)
  // Pattern: tableheader cells contain bold text (dates or category names)
  
  // We'll use a regex to pull the table content embedded in viewstate
  // It contains sequences like: <b>Date</b></td>... <a class="link2" href=...>Title</a>
  
  const tableContent = vsDecoded;
  
  // Extract all direction links
  const linkRegex = /<a\s+class="link2"\s+href=([^>]+)>\s*([\s\S]*?)<\/a>/g;
  const dateHeaderRegex = /<b>((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})<\/b>/g;
  const pdfLinkRegex = /href='(https:\/\/rbidocs\.rbi\.org\.in\/[^']+\.PDF)'/g;
  
  // Extract dates in order
  const dates = [];
  let dm;
  while ((dm = dateHeaderRegex.exec(tableContent)) !== null) {
    dates.push({ index: dm.index, date: dm[1] });
  }
  
  // Extract PDF links in order
  const pdfLinks = [];
  let pm;
  while ((pm = pdfLinkRegex.exec(tableContent)) !== null) {
    pdfLinks.push({ index: pm.index, url: pm[1] });
  }
  
  // Extract direction links in order
  let lm;
  let dirIndex = 0;
  while ((lm = linkRegex.exec(tableContent)) !== null) {
    const rawHref = lm[1].trim();
    const title = lm[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    
    // Construct full link
    let link;
    if (rawHref.startsWith("http")) {
      link = rawHref;
    } else {
      link = BASE_URL + rawHref.replace(/^\.\//, "");
    }
    
    // Find closest earlier date header
    let dateStr = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i].index < lm.index) {
        dateStr = dates[i].date;
        break;
      }
    }
    
    // Find closest later PDF link
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

/**
 * NBFC-ICC applicable filter:
 * Under RBI's Scale Based Regulation (SBR), NBFC-ICC (Investment and Credit Company)
 * is the residual category — companies primarily doing lending/investment.
 * 
 * ALL directions listed under the NBFC category (did=411) apply to NBFC-ICC unless
 * they explicitly mention a different sub-category (P2P, AA, MFI, HFC, CIC, SPD, NOFHC etc.).
 * 
 * We filter OUT directions specific to other sub-types and mark relevant ones.
 */
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

async function main() {
  console.log("Fetching RBI Master Directions for NBFCs...");
  
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
  console.log(`Parsed ${allDirections.length} total NBFC directions`);
  
  // Filter to NBFC-ICC applicable directions
  const nbfcIccDirections = allDirections
    .filter((d) => isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "NBFC-ICC" }));
  
  const excludedDirections = allDirections
    .filter((d) => !isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "Other NBFC sub-type" }));
  
  console.log(`NBFC-ICC applicable: ${nbfcIccDirections.length}`);
  console.log(`Excluded (other sub-types): ${excludedDirections.length}`);
  
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceUrl: NBFC_PAGE_URL,
    category: "NBFC-ICC",
    categoryDescription:
      "Investment and Credit Companies — the residual NBFC category under RBI's Scale Based Regulation (SBR). These are NBFCs primarily engaged in lending and investment activities.",
    count: nbfcIccDirections.length,
    directions: nbfcIccDirections,
    excluded: excludedDirections,
  };
  
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(
    `Wrote ${nbfcIccDirections.length} NBFC-ICC directions to data/master-directions.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
