// Fetches latest SEBI regulations (ICDR, LODR, PIT, SAST)
// from https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3&smid=0
// Compares with stored state to detect updates and send email notifications.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import nodemailer from "nodemailer";

const DATA_PATH = new URL("../data/sebi-regulations.json", import.meta.url);
const SEBI_LISTING_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3&smid=0";
const BASE_URL = "https://www.sebi.gov.in";

// Configured recipients
const RECIPIENTS = process.env.EMAIL_RECIPIENTS
  ? process.env.EMAIL_RECIPIENTS.split(",").map(e => e.trim())
  : [
    "raghuraman@stucred.com",
    "umamaheswari.s@stucred.com"
  ];

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
  },
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

// Extract PDF link from page HTML
function extractPdfLink(html) {
  // Looks for iframe src='...file=https://...'
  const match = html.match(/iframe\s+src='[^']*?file=([^'&]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

// Extract amended date from page HTML
function extractDate(html) {
  // Try <div class='date_value'><h5>Date</h5>
  const divMatch = html.match(/class='date_value'[^>]*>\s*<h5>([^<]+)<\/h5>/i);
  if (divMatch) return divMatch[1].trim();

  // Fallback to title bracket amended date
  const bracketMatch = html.match(/\[Last amended on\s+([^\]]+)\]/i);
  if (bracketMatch) return bracketMatch[1].trim();

  return null;
}

// Extract title from page HTML
function extractTitle(html) {
  const h1Match = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
  return h1Match ? h1Match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

async function sendEmailNotification(updatedRegs) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("------------------------------------------------------------------");
    console.warn("⚠ SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).");
    console.warn("To enable email notifications, set these environment variables in Vercel or GitHub Actions.");
    console.warn(`Would have sent email to: ${RECIPIENTS.join(", ")}`);
    console.log("------------------------------------------------------------------");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465,
    auth: { user, pass }
  });

  const updatesHtml = updatedRegs.map(reg => `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #1F3A5F; background-color: #f7f9fc;">
      <h3 style="color: #1F3A5F; margin: 0 0 8px 0;">${reg.shortName}</h3>
      <p style="margin: 0 0 5px 0;"><strong>New State:</strong> ${reg.title}</p>
      <p style="margin: 0 0 10px 0;"><strong>Amended Date:</strong> ${reg.amendedDate}</p>
      <a href="${reg.link}" style="background-color: #1F3A5F; color: white; padding: 8px 12px; text-decoration: none; border-radius: 3px; font-size: 13px; display: inline-block; margin-right: 10px;">View on SEBI ↗</a>
      ${reg.pdfUrl ? `<a href="${reg.pdfUrl}" style="background-color: #333; color: white; padding: 8px 12px; text-decoration: none; border-radius: 3px; font-size: 13px; display: inline-block;">Download PDF 📄</a>` : ""}
    </div>
  `).join("");

  const emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #1F3A5F; border-bottom: 2px solid #1F3A5F; padding-bottom: 8px;">StuCred RegPulse</h2>
      <p>Hello,</p>
      <p>A new amendment/update has been detected in the following SEBI regulations:</p>
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
      subject: `🚨 StuCred RegPulse Alert: SEBI Regulation Updates (${updatedRegs.length})`,
      html: emailBody,
    });
    console.log(`Email notification successfully sent! Message ID: ${info.messageId}`);
  } catch (err) {
    console.error("Failed to send email notification:", err);
  }
}

async function main() {
  console.log("Fetching SEBI Regulations listing page...");
  const html = await fetchPage(SEBI_LISTING_URL);

  // Find links to regulation detail pages
  // e.g. <a href="https://www.sebi.gov.in/legal/regulations/..."
  const linkMatches = [...html.matchAll(/href="([^"]+\/legal\/regulations\/[^"]+)"/g)];

  console.log(`Found ${linkMatches.length} raw regulation links on the page`);

  const previousData = await loadPreviousData();
  const nextRegulations = { ...previousData.regulations };
  const updatedRegs = [];

  for (const trackRule of TRACKED_REGS) {
    const matchedLink = linkMatches.find(m => trackRule.searchPattern.test(m[1]));

    if (matchedLink) {
      const url = matchedLink[1];
      console.log(`Found matching link for ${trackRule.shortName}: ${url}`);

      try {
        console.log(`Fetching details for ${trackRule.shortName}...`);
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

        // Detect change in URL or amended date
        if (!prevData || prevData.link !== currentData.link || prevData.amendedDate !== currentData.amendedDate) {
          console.log(`🚨 Update detected in ${trackRule.shortName}!`);
          updatedRegs.push(currentData);
        }

        nextRegulations[trackRule.key] = currentData;
      } catch (err) {
        console.error(`Error processing detail page for ${trackRule.shortName}:`, err);
      }
    } else {
      console.warn(`Could not find URL matching pattern for ${trackRule.shortName}`);
    }
  }
  if (Object.keys(nextRegulations).length === 0) {
    throw new Error("SEBI Scraper parsed 0 items. SEBI page layout may have changed.");
  }

  // Save results
  const payload = {
    generatedAt: new Date().toISOString(),
    regulations: nextRegulations,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log("Wrote updated SEBI regulations to data/sebi-regulations.json");

  // Trigger notification if there are changes
  if (updatedRegs.length > 0) {
    await sendEmailNotification(updatedRegs);
  } else {
    console.log("No new SEBI regulation updates detected.");
  }
}

main().catch(err => {
  console.error("Fatal error running SEBI fetch:", err);
  process.exit(1);
});
