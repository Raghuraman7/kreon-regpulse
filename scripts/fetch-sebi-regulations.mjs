import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems, assertNoMassDrop } from "./lib/guards.mjs";
import { loadDataFile, writeDataFile } from "./lib/data-file.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractDateString, isFreshRelease } from "./lib/date-utils.mjs";

const DATA_PATH = new URL("../data/sebi-regulations.json", import.meta.url);
const SEBI_LISTING_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3&smid=0";

// Regs we want to track specifically — relevant to an NBFC / digital lender rather than listed companies
const TRACKED_REGS = [
  {
    key: "cra",
    shortName: "SEBI (Credit Rating Agencies) Regulations, 1999",
    searchPattern: /credit-rating-agencies/i,
  },
  {
    key: "kra",
    shortName: "SEBI (KYC (Know Your Client) Registration Agency) Regulations, 2011",
    searchPattern: /kyc-registration-agency|know-your-client-registration-agency/i,
  },
  {
    key: "ncs",
    shortName: "SEBI (Issue and Listing of Non-Convertible Securities) Regulations, 2021",
    searchPattern: /issue-and-listing-of-non-convertible-securities/i,
  },
  // An issuer of listed non-convertible securities is a listed entity: LODR (Chapter V covers
  // debt-listed entities) and the insider trading rules apply to it.
  {
    key: "lodr",
    shortName: "SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015",
    searchPattern: /listing-obligations-and-disclosure-requirements/i,
  },
  {
    key: "pit",
    shortName: "SEBI (Prohibition of Insider Trading) Regulations, 2015",
    searchPattern: /prohibition-of-insider-trading/i,
  },
];

// Catches any other lending/credit-relevant regulation on the listing page that isn't in
// TRACKED_REGS above, so a newly published SEBI regulation in this space isn't missed.
const NBFC_RELEVANT_KEYWORDS = [
  /credit.rating/i,
  /kyc.registration/i,
  /know.your.client.registration/i,
  /non.convertible.securities/i,
  /non.convertible.debenture/i,
  /debenture.trustee/i,
  /credit.information/i,
  /\bnbfc\b/i,
];

function isDynamicallyTrackedLink(url) {
  const slugText = url.toLowerCase().replace(/[-_]/g, " ");
  return NBFC_RELEVANT_KEYWORDS.some((pattern) => pattern.test(slugText));
}

function deriveKeyFromUrl(url) {
  const idMatch = url.match(/_(\d+)\.html$/i);
  if (idMatch) return `dyn-${idMatch[1]}`;
  const slugMatch = url.match(/\/([^/]+?)(?:_\d+)?\.html$/i);
  return slugMatch ? `dyn-${slugMatch[1]}` : `dyn-${url}`;
}

function loadPreviousData() {
  return loadDataFile(DATA_PATH, { lastChecked: null, regulations: {} });
}

async function fetchWithRetry(url, retries = 3, backoffMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
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

function extractPdfLink(html) {
  const match = html.match(/iframe\s+src='[^']*?file=([^'&]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractDate(html) {
  const divMatch = html.match(/class='date_value'[^>]*>\s*<h5>([^<]+)<\/h5>/i);
  if (divMatch) return extractDateString(divMatch[1]) || divMatch[1].trim();

  const bracketMatch = html.match(/\[Last amended on\s+([^\]]+)\]/i);
  if (bracketMatch) return extractDateString(bracketMatch[1]) || bracketMatch[1].trim();

  return extractDateString(html) || null;
}

function extractTitle(html) {
  const h1Match = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
  return h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

export async function checkSebiRegulations() {
  return withFileLock(DATA_PATH, runCheckSebiRegulations);
}

async function runCheckSebiRegulations() {
  console.log("🔍 Checking SEBI Regulations listing page...");
  const html = await fetchPage(SEBI_LISTING_URL);

  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/regulations\/[^"]+)"/g)];

  console.log(`Found ${linkMatches.length} raw regulation links on the page`);

  const previousData = await loadPreviousData();
  // Start empty (not a spread of previousData.regulations) so regulations no longer
  // matched this run — e.g. stale listed-company keys from before this NBFC-focused
  // filter — drop out instead of lingering in the data file forever.
  const nextRegulations = {};
  const updatedRegs = [];

  async function processRegulation(key, shortName, url) {
    try {
      const detailHtml = await fetchPage(url);

      const prevData = previousData.regulations[key];
      const title = extractTitle(detailHtml) || prevData?.title || shortName;
      // An unreadable date keeps the last known one, so a blocked or changed page
      // isn't reported as an amendment.
      const extractedDate = extractDate(detailHtml);
      const amendedDate = extractedDate || prevData?.amendedDate || "Unknown Date";
      const pdfUrl = extractPdfLink(detailHtml) || prevData?.pdfUrl || null;

      const currentData = {
        key,
        shortName,
        title,
        link: url,
        pdfUrl,
        amendedDate,
        lastUpdated: new Date().toISOString(),
      };

      if (prevData) {
        if (prevData.link !== currentData.link || prevData.amendedDate !== currentData.amendedDate) {
          console.log(`✨ Update detected in ${shortName}!`);
          updatedRegs.push(currentData);
        }
      } else {
        console.log(`✨ New SEBI regulation tracked: ${shortName}`);
        if (extractedDate && isFreshRelease(amendedDate, 30) && Object.keys(previousData.regulations).length > 0) {
          updatedRegs.push(currentData);
        }
      }

      nextRegulations[key] = currentData;
    } catch (err) {
      console.error(`Error processing detail page for ${shortName}:`, err.message);
      // Keep the last-known-good entry; otherwise it would drop out now and be
      // re-announced as "new" on the next successful run.
      if (previousData.regulations[key]) nextRegulations[key] = previousData.regulations[key];
    }
  }

  const matchedUrls = new Set();

  for (const trackRule of TRACKED_REGS) {
    const matchedLink = linkMatches.find(m => trackRule.searchPattern.test(m[1]));

    if (matchedLink) {
      matchedUrls.add(matchedLink[1]);
      await processRegulation(trackRule.key, trackRule.shortName, matchedLink[1]);
    } else {
      console.warn(`Could not find URL matching pattern for ${trackRule.shortName}`);
      // A tracked regulation missing from the listing means the page changed, not that
      // the regulation was repealed; keep what we had.
      if (previousData.regulations[trackRule.key]) nextRegulations[trackRule.key] = previousData.regulations[trackRule.key];
    }
  }

  // Dynamically pick up any other NBFC/lending-relevant regulation on the listing page
  // that isn't already covered by TRACKED_REGS, so new regulations aren't missed.
  for (const m of linkMatches) {
    const url = m[1];
    if (matchedUrls.has(url) || !isDynamicallyTrackedLink(url)) continue;
    matchedUrls.add(url);
    const key = deriveKeyFromUrl(url);
    console.log(`🔎 Dynamically tracking new NBFC-relevant SEBI regulation link: ${url}`);
    await processRegulation(key, previousData.regulations[key]?.shortName || "SEBI Regulation (dynamically discovered)", url);
  }

  assertNoMassDrop(
    Object.keys(nextRegulations).length,
    Object.keys(previousData.regulations).length,
    "SEBI Regulations"
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    regulations: nextRegulations,
  };

  await writeDataFile(DATA_PATH, payload);
  console.log("Wrote updated SEBI regulations to data/sebi-regulations.json");

  if (updatedRegs.length > 0 && Object.keys(previousData.regulations).length > 0) {
    console.log(`✨ Detected ${updatedRegs.length} updated SEBI regulation(s). Dispatching instant email alert...`);
    await sendRegulatoryAlert({
      source: "SEBI",
      category: "Regulation Amendment",
      updates: updatedRegs,
      categoryKey: "sebiRegulations"
    });
  } else {
    console.log("No new SEBI regulation updates detected.");
  }

  return updatedRegs;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-sebi-regulations.mjs")) {
  checkSebiRegulations().catch(err => {
    console.error("Fatal error running SEBI fetch:", err);
    process.exit(1);
  });
}

