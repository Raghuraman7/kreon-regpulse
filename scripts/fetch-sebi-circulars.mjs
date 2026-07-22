// Fetches latest SEBI Circulars from SEBI website
// URL: https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0
// Saves output to data/sebi-circulars.json
// Triggers real-time email alerts via email-notifier.mjs when new circulars are released.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { PDFParse } from "pdf-parse";

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

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
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
    const dateMatch = html.match(/class=\x27date_value\x27[^>]*>\s*<h5>([^<]+)<\/h5>/i) ||
                      html.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i);
    const date = dateMatch ? dateMatch[1].trim() : null;

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

    let isForListedCompanies = false;
    if (finalPdfUrl) {
      try {
        console.log(`📥 Downloading PDF to check target recipients: ${finalPdfUrl}`);
        const res = await fetch(finalPdfUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const parser = new PDFParse({ data: buffer });
          const textResult = await parser.getText();
          const firstPageText = textResult.text.substring(0, 2000);
          
          // Match recipients block for listed companies or entities
          const hasListedRecipients = /all\s+listed\s+(?:companies|entities)/i.test(firstPageText);
          if (hasListedRecipients) {
            isForListedCompanies = true;
            console.log(`✅ Verified target audience: Addressed to Listed Companies/Entities.`);
          } else {
            console.log(`ℹ️ PDF does not mention listed companies/entities as recipients.`);
          }
        }
      } catch (pdfErr) {
        console.warn(`⚠️ Failed to parse PDF: ${pdfErr.message}. Falling back to keywords.`);
        isForListedCompanies = isApplicableToListedCompanies(title, department);
      }
    } else {
      isForListedCompanies = isApplicableToListedCompanies(title, department);
    }

    return { title, date, pdfUrl: finalPdfUrl, department, isForListedCompanies };
  } catch (err) {
    console.warn(`Failed to fetch details for SEBI circular ${url}:`, err.message);
    return { title: "", date: null, pdfUrl: null, department: null, isForListedCompanies: false };
  }
}

const APPLICABLE_KEYWORDS = [
  /listed compan/i,
  /listed entit/i,
  /listing obligation/i,
  /\blodr\b/i,
  /insider trading/i,
  /\bpit\b/i,
  /takeover/i,
  /\bsast\b/i,
  /issue of capital/i,
  /\bicdr\b/i,
  /corporate governance/i,
  /shareholder/i,
  /promoter/i,
  /equity share/i,
  /listed debt/i,
  /buyback/i,
  /buy-back/i,
  /scheme.*of.*arrangement/i,
  /prohibition of fraudulent.*unfair trade/i,
  /\bpfutp\b/i
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

function isApplicableToListedCompanies(title, department) {
  const t = title || "";
  const d = department || "";

  // 1. If it explicitly contains exclude keywords, exclude it
  for (const pattern of EXCLUDE_KEYWORDS) {
    if (pattern.test(t) || pattern.test(d)) {
      return false;
    }
  }

  // 2. CFD (Corporation Finance Department) or ISD (Integrated Surveillance Department) are always applicable unless excluded above
  const lowerDept = d.toLowerCase();
  if (lowerDept.includes("corporation finance") || lowerDept.includes("cfd") || lowerDept.includes("integrated surveillance") || lowerDept.includes("isd")) {
    return true;
  }

  // 3. Check positive keywords
  for (const pattern of APPLICABLE_KEYWORDS) {
    if (pattern.test(t)) {
      return true;
    }
  }

  // 4. Default to false to focus exclusively on listed companies
  return false;
}

export async function checkSebiCirculars() {
  console.log("🔍 Checking SEBI Circulars...");
  const html = await fetchPage(SEBI_CIRCULAR_LIST_URL);

  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/circulars\/[^"]+)"/gi)];
  console.log(`Found ${linkMatches.length} raw SEBI circular links on listing page.`);

  const previousData = await loadPreviousData();
  const prevUrls = new Set(previousData.circulars.map(c => c.link));
  const newCirculars = [];
  const allParsed = [];

  for (const m of linkMatches) {
    const url = m[1];
    // ID from filename or link
    const idMatch = url.match(/_(\d+)\.html$/i);
    const id = idMatch ? `sebi-circ-${idMatch[1]}` : url;

    allParsed.push({ id, link: url });

    if (!prevUrls.has(url)) {
      const details = await fetchCircularDetails(url);

      // Check if applicable to listed companies
      if (!details.isForListedCompanies) {
        console.log(`ℹ️ Skipping SEBI Circular (not addressed to listed companies): ${details.title || url}`);
        continue;
      }

      console.log(`✨ New SEBI Circular detected (applicable to listed companies): ${details.title || url}`);
      
      const fullItem = {
        id,
        link: url,
        title: details.title || "SEBI Circular",
        date: details.date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        pdfUrl: details.pdfUrl,
        department: details.department,
        summary: details.title ? `Circular issued by SEBI: ${details.title}` : "New SEBI Circular released.",
        detectedAt: new Date().toISOString()
      };

      newCirculars.push(fullItem);
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

  if (newCirculars.length > 0 && previousData.circulars.length > 0) {
    console.log(`✨ Detected ${newCirculars.length} new SEBI circular(s). (Real-time email notification disabled)`);
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
