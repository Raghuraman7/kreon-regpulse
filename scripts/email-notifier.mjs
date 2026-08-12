// Unified Email Notifier for Kreon RegPulse
// Sends styled HTML email alerts to configured recipients upon regulatory updates.

import nodemailer from "nodemailer";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file if available
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
      // Ignore env parsing errors
    }
  }
}

loadEnv();

// Recipients live in config/recipients.json so they're defined in one place instead of
// duplicated across email-notifier.mjs and send-monthly-digest.mjs.
function loadRecipientsConfig() {
  const configPath = join(__dirname, "../config/recipients.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    // Fallback keeps the notifier working even if config/recipients.json is missing.
    return {
      default: [
        "umamaheswari.s@stucred.com",
        "raghuraman@stucred.com",
        "shubhrajyoti.c@stucred.com"
      ],
      devOps: ["raghuraman@stucred.com"]
    };
  }
}

const RECIPIENTS_CONFIG = loadRecipientsConfig();

export const DEFAULT_RECIPIENTS = RECIPIENTS_CONFIG.default;

function envList(name) {
  if (!process.env[name]) return [];
  return process.env[name].split(",").map(e => e.trim()).filter(Boolean);
}

function dedupe(list) {
  return Array.from(new Set(list));
}

// Categories the CS/compliance team is subscribed to — the policies they actually
// track day to day. CEO gets these too, plus RBI Notifications & SEBI Circulars,
// which CS does not get instant alerts for.
const CS_TEAM_CATEGORIES = new Set([
  "rbiMasterDirections",
  "sebiRegulations",
  "actsRules",
  "secretarialStandards",
]);

/**
 * Resolves alert recipients for a given category key.
 *
 * @param {string} [categoryKey] - one of "rbiMasterDirections", "sebiRegulations",
 *   "actsRules", "secretarialStandards", "rbiNotifications", "sebiCirculars", or
 *   "digest" (the monthly rollup, sent to everyone). Omit for old/uncategorized
 *   call sites, which fall back to the flat default list.
 */
export function getRecipients(categoryKey) {
  // Explicit global override still wins — useful for testing, but note it bypasses
  // CS/CEO category routing entirely, so leave it unset in normal operation.
  if (process.env.EMAIL_RECIPIENTS) {
    return process.env.EMAIL_RECIPIENTS.split(",").map(e => e.trim()).filter(Boolean);
  }

  const csTeam = envList("CS_TEAM_RECIPIENTS");
  const ceo = envList("CEO_RECIPIENTS");

  if (csTeam.length > 0 || ceo.length > 0) {
    if (categoryKey === "digest") {
      return dedupe([...csTeam, ...ceo]);
    }
    if (categoryKey && CS_TEAM_CATEGORIES.has(categoryKey)) {
      return dedupe([...csTeam, ...ceo]); // CEO gets everything CS gets too
    }
    if (categoryKey) {
      return dedupe(ceo); // rbiNotifications / sebiCirculars: CEO only
    }
  }

  return DEFAULT_RECIPIENTS;
}

export function getDevOpsRecipients() {
  if (process.env.DEV_OPS_RECIPIENTS) {
    return process.env.DEV_OPS_RECIPIENTS.split(",").map(e => e.trim()).filter(Boolean);
  }
  return RECIPIENTS_CONFIG.devOps && RECIPIENTS_CONFIG.devOps.length > 0
    ? RECIPIENTS_CONFIG.devOps
    : DEFAULT_RECIPIENTS;
}

/**
 * Creates nodemailer transporter based on process.env
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

/**
 * Sends a regulatory update email alert.
 *
 * @param {Object} options
 * @param {string} options.source - 'RBI' | 'SEBI' | 'MCA' | 'IRDAI'
 * @param {string} options.category - e.g. 'Circular', 'Master Direction', 'Regulation', 'Notification'
 * @param {Array<{title: string, link: string, pdfUrl?: string, date?: string, summary?: string, id?: string}>} options.updates
 * @param {string} [options.customSubject]
 * @param {string} [options.categoryKey] - routing key for CS/CEO recipient groups, see getRecipients()
 */
export async function sendRegulatoryAlert({ source, category, updates, customSubject, categoryKey }) {
  const recipients = getRecipients(categoryKey);
  const transporter = createTransporter();

  if (!updates || updates.length === 0) {
    return { success: false, reason: "No updates provided" };
  }

  if (!transporter) {
    console.log("\n------------------------------------------------------------------");
    console.warn("⚠ SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS missing).");
    console.warn(`[MOCK ALERT] Would send instant email to: ${recipients.join(", ")}`);
    console.warn(`[MOCK ALERT] Updates detected (${source} ${category}): ${updates.length}`);
    updates.forEach((u, i) => {
      console.warn(`  ${i + 1}. ${u.title} (${u.link})`);
    });
    console.log("------------------------------------------------------------------\n");
    return { success: false, reason: "SMTP credentials missing" };
  }

  const sourceColors = {
    RBI: { bg: "#1F3A5F", text: "#FFFFFF", badge: "#3B82F6" },
    SEBI: { bg: "#0D2538", text: "#FFFFFF", badge: "#10B981" },
    MCA: { bg: "#2E1065", text: "#FFFFFF", badge: "#8B5CF6" },
    ICSI: { bg: "#7C2D12", text: "#FFFFFF", badge: "#F59E0B" },
    DEFAULT: { bg: "#1F2937", text: "#FFFFFF", badge: "#6B7280" },
  };

  const theme = sourceColors[source.toUpperCase()] || sourceColors.DEFAULT;
  const subject = customSubject || `🚨 Instant Alert: ${source} ${category} Update (${updates.length} item${updates.length > 1 ? "s" : ""})`;

  const itemsHtml = updates.map(item => `
    <div style="margin-bottom: 24px; padding: 18px; border-radius: 8px; border-left: 5px solid ${theme.badge}; background-color: #F8FAFC; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="background-color: ${theme.badge}; color: #FFFFFF; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">${source} • ${category}</span>
        ${item.date ? `<span style="font-size: 12px; color: #64748B;">📅 ${item.date}</span>` : ""}
      </div>
      <h3 style="color: #0F172A; margin: 8px 0 10px 0; font-size: 16px; line-height: 1.4;">${item.title}</h3>
      ${item.summary ? `
        <div style="background-color: #FFFFFF; padding: 12px; border-radius: 6px; border: 1px solid #E2E8F0; margin-bottom: 12px; font-size: 13px; color: #334155; line-height: 1.5;">
          <strong>Summary of Changes & Impact:</strong>
          <p style="margin: 4px 0 0 0;">${item.summary}</p>
        </div>
      ` : ""}
      <div style="margin-top: 12px;">
        <a href="${item.link}" target="_blank" style="background-color: ${theme.bg}; color: #FFFFFF; padding: 8px 14px; text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: 600; display: inline-block; margin-right: 8px;">View Official Release ↗</a>
        ${item.pdfUrl ? `<a href="${item.pdfUrl}" target="_blank" style="background-color: #475569; color: #FFFFFF; padding: 8px 14px; text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: 600; display: inline-block;">Download PDF 📄</a>` : ""}
      </div>
    </div>
  `).join("");

  const emailBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
        
        <!-- Header -->
        <div style="background-color: ${theme.bg}; padding: 24px; text-align: left; color: #FFFFFF;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; margin-bottom: 4px;">Kreon RegPulse Real-Time Alert</div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF;">${source} Regulatory Update Released</h1>
        </div>

        <!-- Content -->
        <div style="padding: 24px;">
          <p style="font-size: 14px; color: #334155; margin-top: 0;">Hello,</p>
          <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">A new regulatory update has just been detected from <strong>${source}</strong>:</p>
          
          ${itemsHtml}

          <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; padding: 12px; margin-top: 20px; font-size: 12px; color: #1E40AF;">
            💡 <strong>Instant Alert System:</strong> This notification was dispatched by your Kreon RegPulse continuous watcher daemon.
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; padding: 16px 24px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8;">
          Kreon RegPulse Compliance Monitoring Service • Recipients: ${recipients.join(", ")}
        </div>

      </div>
    </body>
    </html>
  `;

  try {
    const fromAddress = process.env.SMTP_FROM || `"Kreon RegPulse" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(", "),
      subject,
      html: emailBody,
    });
    console.log(`✅ ${source} Real-Time Email Alert sent successfully to ${recipients.join(", ")}! Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Error sending ${source} email notification:`, err);
    return { success: false, error: err };
  }
}

/**
 * Sends a "scraper health warning" email to dev/ops (not the manager recipient list)
 * when a single source has failed or returned 0 items for several consecutive check cycles.
 *
 * @param {Object} options
 * @param {string} options.source - internal source key, e.g. 'rbiNotifications'
 * @param {string} options.label - human-readable label, e.g. 'RBI Notifications'
 * @param {number} options.consecutiveFailures
 * @param {string} [options.lastError]
 */
export async function sendScraperHealthWarning({ source, label, consecutiveFailures, lastError }) {
  const recipients = getDevOpsRecipients();
  const transporter = createTransporter();
  const displayName = label || source;
  const subject = `⚠️ Kreon RegPulse: "${displayName}" scraper has failed ${consecutiveFailures}x in a row`;

  if (!transporter) {
    console.log("\n------------------------------------------------------------------");
    console.warn("⚠ SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS missing).");
    console.warn(`[MOCK HEALTH ALERT] Would send to: ${recipients.join(", ")}`);
    console.warn(`[MOCK HEALTH ALERT] ${displayName} has failed ${consecutiveFailures} consecutive check cycles. Last error: ${lastError || "n/a"}`);
    console.log("------------------------------------------------------------------\n");
    return { success: false, reason: "SMTP credentials missing" };
  }

  const emailBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
        <div style="background-color: #B91C1C; padding: 24px; color: #FFFFFF;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #FECACA; margin-bottom: 4px;">Kreon RegPulse • Scraper Health Warning</div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 700;">"${displayName}" has failed ${consecutiveFailures} consecutive checks</h1>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 14px; color: #334155;">The <strong>${displayName}</strong> scraper has either thrown an error or parsed 0 items for <strong>${consecutiveFailures}</strong> consecutive check cycles. This usually means the source website's layout changed or it is temporarily unreachable, and it may be silently missing regulatory updates until fixed.</p>
          ${lastError ? `
          <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; margin-top: 12px; font-size: 12px; color: #991B1B; font-family: monospace; word-break: break-word;">
            ${lastError}
          </div>` : ""}
          <p style="font-size: 13px; color: #64748B; margin-top: 20px;">This alert goes only to dev/ops, not the compliance recipient list, since it's an operational issue rather than a regulatory update.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const fromAddress = process.env.SMTP_FROM || `"Kreon RegPulse" <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(", "),
      subject,
      html: emailBody,
    });
    console.log(`✅ Scraper health warning sent to ${recipients.join(", ")} for ${displayName}. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Error sending scraper health warning for ${displayName}:`, err);
    return { success: false, error: err };
  }
}
