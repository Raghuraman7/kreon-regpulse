import { writeFile, readFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";

const DATA_PATH = new URL("../data/sebi-regulations.json", import.meta.url);
const SEBI_LISTING_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3&smid=0";

// Regs we want to track specifically
const TRACKED_REGS = [
  {
    key: "icdr",
    shortName: "SEBI (ICDR) Regulations, 2018",
    searchPattern: /issue-of-capital-and-disclosure-requirements/i,
  },
  {
    key: "lodr",
    shortName: "SEBI (LODR) Regulations, 2015",
    searchPattern: /listing-obligations-and-disclosure-requirements/i,
  },
  {
    key: "pit",
    shortName: "SEBI (Prohibition of Insider Trading) Regulations, 2015",
    searchPattern: /prohibition-of-insider-trading/i,
  },
  {
    key: "sast",
    shortName: "SEBI (SAST) Regulations, 2011",
    searchPattern: /substantial-acquisition-of-shares-and-takeovers/i,
  }
];

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastChecked: null, regulations: {} };
  }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

function extractPdfLink(html) {
  const match = html.match(/iframe\s+src='[^']*?file=([^'&]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractDate(html) {
  const divMatch = html.match(/class='date_value'[^>]*>\s*<h5>([^<]+)<\/h5>/i);
  if (divMatch) return divMatch[1].trim();

  const bracketMatch = html.match(/\[Last amended on\s+([^\]]+)\]/i);
  if (bracketMatch) return bracketMatch[1].trim();

  return null;
}

function extractTitle(html) {
  const h1Match = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
  return h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

export async function checkSebiRegulations() {
  console.log("🔍 Checking SEBI Regulations listing page...");
  const html = await fetchPage(SEBI_LISTING_URL);

  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/regulations\/[^"]+)"/g)];

  console.log(`Found ${linkMatches.length} raw regulation links on the page`);

  const previousData = await loadPreviousData();
  const nextRegulations = { ...previousData.regulations };
  const updatedRegs = [];

  for (const trackRule of TRACKED_REGS) {
    const matchedLink = linkMatches.find(m => trackRule.searchPattern.test(m[1]));

    if (matchedLink) {
      const url = matchedLink[1];

      try {
        const detailHtml = await fetchPage(url);

        const title = extractTitle(detailHtml) || trackRule.shortName;
        const amendedDate = extractDate(detailHtml) || "Unknown Date";
        const pdfUrl = extractPdfLink(detailHtml);

        const currentData = {
          key: trackRule.key,
          shortName: trackRule.shortName,
          title,
          link: url,
          pdfUrl,
          amendedDate,
          lastUpdated: new Date().toISOString(),
        };

        const prevData = previousData.regulations[trackRule.key];

        if (!prevData || prevData.link !== currentData.link || prevData.amendedDate !== currentData.amendedDate) {
          console.log(`✨ Update detected in ${trackRule.shortName}!`);
          updatedRegs.push(currentData);
        }

        nextRegulations[trackRule.key] = currentData;
      } catch (err) {
        console.error(`Error processing detail page for ${trackRule.shortName}:`, err.message);
      }
    } else {
      console.warn(`Could not find URL matching pattern for ${trackRule.shortName}`);
    }
  }

  if (Object.keys(nextRegulations).length === 0) {
    throw new Error("SEBI Scraper parsed 0 items. SEBI page layout may have changed.");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    regulations: nextRegulations,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log("Wrote updated SEBI regulations to data/sebi-regulations.json");

  if (updatedRegs.length > 0 && Object.keys(previousData.regulations).length > 0) {
    console.log(`✨ Detected ${updatedRegs.length} updated SEBI regulation(s). (Real-time email notification disabled)`);
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

