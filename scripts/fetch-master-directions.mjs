// Fetches RBI Master Directions for Non-Banking Financial Companies (NBFC-ICC)
// from https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411
// Parses the HTML and extracts direction titles, dates, links, and PDF links.
// Compares with stored state to detect updates and send email notifications.
// Run with: node scripts/fetch-master-directions.mjs

import { writeFile, readFile, mkdir } from "node:fs/promises";
import nodemailer from "nodemailer";

const OUTPUT_PATH = new URL("../data/master-directions.json", import.meta.url);
const NBFC_PAGE_URL = "https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411";
const BASE_URL = "https://www.rbi.org.in/Scripts/";

// Configured recipients
const RECIPIENTS = process.env.EMAIL_RECIPIENTS
  ? process.env.EMAIL_RECIPIENTS.split(",").map(e => e.trim())
  : [
    "raghuraman@stucred.com",
    "umamaheswari.s@stucred.com"
  ];

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
      link = BASE_URL + rawHref.replace(/^\.\//, "");
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

async function sendEmailNotification(updatedDirs) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("------------------------------------------------------------------");
    console.warn("⚠ SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).");
    console.warn("To enable email notifications, set these environment variables in Vercel or GitHub Actions.");
    console.warn(`Would have sent email for RBI updates to: ${RECIPIENTS.join(", ")}`);
    console.log("------------------------------------------------------------------");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465,
    auth: { user, pass }
  });

  const updatesHtml = updatedDirs.map(dir => `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #1F3A5F; background-color: #f7f9fc;">
      <h3 style="color: #1F3A5F; margin: 0 0 8px 0;">RBI Master Direction Update</h3>
      <p style="margin: 0 0 5px 0;"><strong>Title:</strong> ${dir.title}</p>
      <p style="margin: 0 0 10px 0;"><strong>Issued Date:</strong> ${dir.issuedDateRaw || "N/A"}</p>
      <a href="${dir.link}" style="background-color: #1F3A5F; color: white; padding: 8px 12px; text-decoration: none; border-radius: 3px; font-size: 13px; display: inline-block; margin-right: 10px;">View on RBI ↗</a>
      ${dir.pdfUrl ? `<a href="${dir.pdfUrl}" style="background-color: #333; color: white; padding: 8px 12px; text-decoration: none; border-radius: 3px; font-size: 13px; display: inline-block;">Download PDF 📄</a>` : ""}
    </div>
  `).join("");

  const emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #1F3A5F; border-bottom: 2px solid #1F3A5F; padding-bottom: 8px;">StuCred RegPulse</h2>
      <p>Hello,</p>
      <p>A new or updated RBI Master Direction applicable to NBFC-ICC has been detected:</p>
      ${updatesHtml}
      <p style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px;">
        This is an automated notification from your StuCred RegPulse instance.
      </p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"StuCred RegPulse" <${user}>`,
      to: RECIPIENTS.join(", "),
      subject: `🚨 StuCred RegPulse Alert: RBI NBFC-ICC Master Directions Updates (${updatedDirs.length})`,
      html: emailBody,
    });
    console.log(`RBI Email notification successfully sent! Message ID: ${info.messageId}`);
  } catch (err) {
    console.error("Failed to send RBI email notification:", err);
  }
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

  // Filter to NBFC-ICC applicable directions
  const nbfcIccDirections = allDirections
    .filter((d) => isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "NBFC-ICC" }));

  const excludedDirections = allDirections
    .filter((d) => !isNBFCICCApplicable(d.title))
    .map((d) => ({ ...d, applicableTo: "Other NBFC sub-type" }));

  console.log(`NBFC-ICC applicable: ${nbfcIccDirections.length}`);
  console.log(`Excluded (other sub-types): ${excludedDirections.length}`);

  // Compare with previous state to detect updates
  const previousData = await loadPreviousData();
  const updatedDirs = [];

  nbfcIccDirections.forEach(dir => {
    // Find direction in previous run by matching partial titles
    const prev = previousData.directions.find(p => p.link === dir.link);
    if (!prev) {
      console.log(`New Master Direction detected: ${dir.title}`);
      updatedDirs.push(dir);
    } else if (prev.title !== dir.title) {
      console.log(`Updated Master Direction title detected: ${dir.title}`);
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

  if (updatedDirs.length > 0 && previousData.directions.length > 0) {
    await sendEmailNotification(updatedDirs);
  } else {
    console.log("No new RBI Master Direction updates detected.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
