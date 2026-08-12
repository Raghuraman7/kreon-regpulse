// Executive Monthly Compliance Digest Generator & Notifier for Kreon RegPulse
// Generates and emails a styled HTML summary table of all RBI & SEBI regulatory
// releases for the current (or given) calendar month. Handles exact dynamic month
// lengths (28, 29, 30, 31 days) and professional executive formatting.
// Run: node scripts/send-monthly-digest.mjs
// Run for a specific month (e.g. re-sending): node scripts/send-monthly-digest.mjs --month 7 --year 2026

import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { getRecipients } from "./email-notifier.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, "../.env");
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore env parsing
    }
  }
}
loadEnv();

// Monthly digest is a rollup of every category, so it goes to the union of CS team + CEO.
const RECIPIENTS = getRecipients("digest");
const DASHBOARD_URL = "https://kreonregpulse.vercel.app/";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

async function readJsonFile(path) {
  try {
    const raw = await readFile(new URL(path, import.meta.url), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Parses date string to JavaScript Date object
 */
function parseToDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const lower = dateStr.toLowerCase();
  
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i])) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      const dayMatch = lower.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (yearMatch && dayMatch) {
        return new Date(parseInt(yearMatch[1], 10), i, parseInt(dayMatch[1], 10));
      }
    }
  }
  return null;
}

/**
 * True if dateStr falls within the given calendar month/year.
 */
function isInMonth(dateStr, targetMonth, targetYear) {
  if (!dateStr) return false;
  const parsed = parseToDate(dateStr);

  if (parsed) {
    return (parsed.getMonth() + 1 === targetMonth) && (parsed.getFullYear() === targetYear);
  }

  // String fallback
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const lower = dateStr.toLowerCase();
  const targetMonthName = monthNames[targetMonth - 1];
  return lower.includes(targetMonthName) && lower.includes(String(targetYear));
}

export async function generateAndSendPeriodicDigest({ month, year } = {}) {
  const now = new Date();
  const targetMonth = month || (now.getMonth() + 1);
  const targetYear = year || now.getFullYear();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = monthNames[targetMonth - 1];

  // Calculate exact last day of the target month dynamically (28, 29, 30, or 31)
  const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();

  // Guard against duplicate sends: an automatic (cron-triggered) call with no explicit
  // month/year should only actually send on the real last day of the month. This makes
  // the digest robust even if the scheduler (e.g. a "28,29,30,31" cron) fires on more
  // than one calendar day in a given month — an explicit --month/--year re-send always
  // goes through regardless of today's date.
  const isAutomaticRun = !month && !year;
  if (isAutomaticRun && now.getDate() !== lastDayOfMonth) {
    console.log(`⏭ Skipping monthly digest: today (${now.getDate()}) is not yet the last day of the month (${lastDayOfMonth}).`);
    return { success: false, reason: "Not the last day of the month yet" };
  }

  const periodTitle = "Monthly Executive Compliance Digest";
  const dateRangeString = `${monthName} 1 – ${monthName} ${lastDayOfMonth}, ${targetYear}`;

  console.log(`\n==================================================================`);
  console.log(`📊 Generating ${periodTitle} (${dateRangeString})...`);
  console.log(`==================================================================`);

  // Load datasets
  const rbiNotifsData = await readJsonFile("../data/rbi-notifications.json");
  const sebiCircsData = await readJsonFile("../data/sebi-circulars.json");
  const rbiMasterData = await readJsonFile("../data/master-directions.json");
  const sebiRegsData = await readJsonFile("../data/sebi-regulations.json");

  const allItems = [];

  // RBI Notifications
  if (rbiNotifsData && rbiNotifsData.notifications) {
    rbiNotifsData.notifications.forEach(n => {
      if (isInMonth(n.date, targetMonth, targetYear) || isInMonth(n.detectedAt, targetMonth, targetYear)) {
        allItems.push({
          source: "RBI",
          category: "Notification",
          title: n.circularNo ? `[${n.circularNo}] ${n.title}` : n.title,
          date: n.date || "N/A",
          link: n.link,
          pdfUrl: n.pdfUrl,
        });
      }
    });
  }

  // SEBI Circulars
  if (sebiCircsData && sebiCircsData.circulars) {
    sebiCircsData.circulars.forEach(c => {
      if (isInMonth(c.date, targetMonth, targetYear) || isInMonth(c.detectedAt, targetMonth, targetYear)) {
        allItems.push({
          source: "SEBI",
          category: "Circular",
          title: c.department ? `[${c.department}] ${c.title}` : c.title,
          date: c.date || "N/A",
          link: c.link,
          pdfUrl: c.pdfUrl,
        });
      }
    });
  }

  // RBI Master Directions
  if (rbiMasterData && rbiMasterData.directions) {
    rbiMasterData.directions.forEach(d => {
      if (isInMonth(d.issuedDateRaw, targetMonth, targetYear) || isInMonth(d.issuedDate, targetMonth, targetYear)) {
        allItems.push({
          source: "RBI",
          category: "Master Direction",
          title: d.title,
          date: d.issuedDateRaw || "N/A",
          link: d.link,
          pdfUrl: d.pdfUrl,
        });
      }
    });
  }

  // SEBI Regulations
  if (sebiRegsData && sebiRegsData.regulations) {
    Object.values(sebiRegsData.regulations).forEach(r => {
      if (isInMonth(r.amendedDate, targetMonth, targetYear) || isInMonth(r.lastUpdated, targetMonth, targetYear)) {
        allItems.push({
          source: "SEBI",
          category: "Regulation Amendment",
          title: `${r.shortName}: ${r.title}`,
          date: r.amendedDate || "N/A",
          link: r.link,
          pdfUrl: r.pdfUrl,
        });
      }
    });
  }

  console.log(`Found ${allItems.length} regulatory releases for ${dateRangeString}.`);

  const rbiCount = allItems.filter(i => i.source === "RBI").length;
  const sebiCount = allItems.filter(i => i.source === "SEBI").length;

  // Digest table intentionally omits per-item summaries — title + date + links only.
  // Full summaries stay in the instant/live alert emails (email-notifier.mjs), which
  // fire per-item as things happen; repeating them here would make a whole-month
  // rollup unreadably long.
  const tableRowsHtml = allItems.length > 0 ? allItems.map((item, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"}; border-bottom: 1px solid #E2E8F0;">
      <td style="padding: 12px 10px; font-size: 13px; color: #475569; text-align: center; font-weight: bold;">${idx + 1}</td>
      <td style="padding: 12px 10px; font-size: 12px; color: #64748B; white-space: nowrap;">${item.date}</td>
      <td style="padding: 12px 10px; text-align: center;">
        <span style="background-color: ${item.source === "RBI" ? "#1F3A5F" : "#0D2538"}; color: #FFFFFF; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 4px;">${item.source}</span>
      </td>
      <td style="padding: 12px 10px; font-size: 12px; color: #334155; font-weight: 600;">${item.category}</td>
      <td style="padding: 12px 14px; font-size: 13px; color: #0F172A;">${item.title}</td>
      <td style="padding: 12px 10px; white-space: nowrap; text-align: center;">
        <a href="${item.link}" target="_blank" style="background-color: #1F3A5F; color: #FFFFFF; padding: 5px 10px; text-decoration: none; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 4px;">View ↗</a>
        ${item.pdfUrl ? `<br/><a href="${item.pdfUrl}" target="_blank" style="background-color: #475569; color: #FFFFFF; padding: 5px 10px; text-decoration: none; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block;">PDF 📄</a>` : ""}
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="6" style="padding: 30px; text-align: center; color: #64748B; font-size: 14px;">
        No regulatory releases recorded for ${dateRangeString}.
      </td>
    </tr>
  `;

  const emailSubject = `📅 Kreon RegPulse: Monthly Executive Compliance Digest (${monthName} 1 – ${lastDayOfMonth}, ${targetYear}) — ${allItems.length} Releases`;

  const emailBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px;">
      <div style="max-width: 920px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
        
        <!-- Header -->
        <div style="background-color: #1F3A5F; padding: 28px 32px; color: #FFFFFF;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #93C5FD; margin-bottom: 6px;">Kreon RegPulse • Compliance Register</div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF;">${periodTitle}</h1>
          <p style="margin: 6px 0 0 0; font-size: 14px; color: #CBD5E1;">Official Summary of RBI & SEBI updates for <strong>${dateRangeString}</strong></p>
        </div>

        <!-- Summary Stats Cards -->
        <div style="padding: 24px 32px; background-color: #F8FAFC; border-bottom: 1px solid #E2E8F0; display: flex; gap: 16px;">
          <div style="flex: 1; background-color: #FFFFFF; padding: 14px 18px; border-radius: 8px; border: 1px solid #E2E8F0;">
            <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: bold;">Total Releases</div>
            <div style="font-size: 24px; font-weight: bold; color: #1F3A5F; margin-top: 4px;">${allItems.length}</div>
          </div>
          <div style="flex: 1; background-color: #FFFFFF; padding: 14px 18px; border-radius: 8px; border: 1px solid #E2E8F0;">
            <div style="font-size: 11px; color: #3B82F6; text-transform: uppercase; font-weight: bold;">RBI Updates</div>
            <div style="font-size: 24px; font-weight: bold; color: #1E40AF; margin-top: 4px;">${rbiCount}</div>
          </div>
          <div style="flex: 1; background-color: #FFFFFF; padding: 14px 18px; border-radius: 8px; border: 1px solid #E2E8F0;">
            <div style="font-size: 11px; color: #10B981; text-transform: uppercase; font-weight: bold;">SEBI Updates</div>
            <div style="font-size: 24px; font-weight: bold; color: #065F46; margin-top: 4px;">${sebiCount}</div>
          </div>
        </div>

        <!-- Content Table -->
        <div style="padding: 24px 32px;">
          <p style="font-size: 14px; color: #334155; margin-top: 0;">Hello,</p>
          <p style="font-size: 14px; color: #334155; margin-bottom: 16px;">
            Here is the executive compliance register table summarizing all regulatory amendments, circulars, notifications, and master direction updates released by <strong>RBI</strong> and <strong>SEBI</strong> for <strong>${dateRangeString}</strong>:
          </p>

          <p style="margin: 0 0 20px 0;">
            <a href="${DASHBOARD_URL}" target="_blank" style="background-color: #1F3A5F; color: #FFFFFF; padding: 9px 16px; text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: 600; display: inline-block;">View Full Dashboard ↗</a>
          </p>

          <div style="overflow-x: auto; border: 1px solid #E2E8F0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; background-color: #FFFFFF;">
              <thead>
                <tr style="background-color: #1F3A5F; color: #FFFFFF; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 12px 10px; width: 40px; text-align: center;">#</th>
                  <th style="padding: 12px 10px; width: 100px;">Date</th>
                  <th style="padding: 12px 10px; width: 80px; text-align: center;">Authority</th>
                  <th style="padding: 12px 10px; width: 130px;">Category</th>
                  <th style="padding: 12px 14px;">Title</th>
                  <th style="padding: 12px 10px; width: 90px; text-align: center;">Links</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>

          <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px; margin-top: 24px; font-size: 13px; color: #1E40AF; line-height: 1.5;">
            📌 <strong>Compliance Register:</strong> This summary report compiles all official circulars, notifications, and master direction updates recorded in Kreon RegPulse for <strong>${dateRangeString}</strong>.
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; padding: 16px 32px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8;">
          <a href="${DASHBOARD_URL}" style="color: #1F3A5F; font-weight: 600; text-decoration: none;">${DASHBOARD_URL}</a>
        </div>

      </div>
    </body>
    </html>
  `;

  const transporter = createTransporter();
  if (!transporter) {
    console.log("\n------------------------------------------------------------------");
    console.warn("⚠ SMTP credentials not configured. Mocking Periodic Digest output:");
    console.warn(`Subject: ${emailSubject}`);
    console.warn(`Recipients: ${RECIPIENTS.join(", ")}`);
    console.warn(`Total items in table: ${allItems.length}`);
    console.log("------------------------------------------------------------------\n");
    return { success: false, reason: "SMTP credentials missing" };
  }

  try {
    const fromAddress = process.env.SMTP_FROM || `"Kreon RegPulse" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: RECIPIENTS.join(", "),
      subject: emailSubject,
      html: emailBody,
    });
    console.log(`✅ ${periodTitle} Email sent successfully to ${RECIPIENTS.join(", ")}! Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("❌ Failed to send digest email:", err);
    return { success: false, error: err };
  }
}

// Backward compatibility helper
export async function generateAndSendMonthlyDigest(monthNum, yearNum) {
  return generateAndSendPeriodicDigest({ month: monthNum, year: yearNum });
}

// Command-line execution support
if (process.argv[1] && process.argv[1].endsWith("send-monthly-digest.mjs")) {
  let month = null;
  let year = null;

  const monthIdx = process.argv.indexOf("--month");
  if (monthIdx !== -1 && process.argv[monthIdx + 1]) {
    month = parseInt(process.argv[monthIdx + 1], 10);
  }

  const yearIdx = process.argv.indexOf("--year");
  if (yearIdx !== -1 && process.argv[yearIdx + 1]) {
    year = parseInt(process.argv[yearIdx + 1], 10);
  }

  generateAndSendPeriodicDigest({ month, year }).catch(err => {
    console.error("Fatal error in generateAndSendPeriodicDigest:", err);
    process.exit(1);
  });
}
