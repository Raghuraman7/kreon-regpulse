// Fetches latest RBI Circulars and Notifications from RBI website
// URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx
// Saves output to data/rbi-notifications.json
// Triggers real-time email alerts via email-notifier.mjs when new notifications are released.

import { sendRegulatoryAlert } from "./email-notifier.mjs";
import { assertNonZeroItems } from "./lib/guards.mjs";
import { loadDataFile, writeDataFile } from "./lib/data-file.mjs";
import { withFileLock } from "./lib/file-lock.mjs";
import { extractDateString, extractScopedDate, resolveMissingDate, isFreshRelease } from "./lib/date-utils.mjs";

const DATA_PATH = new URL("../data/rbi-notifications.json", import.meta.url);
const RBI_NOTIF_LIST_URL = "https://www.rbi.org.in/Scripts/NotificationUser.aspx";
const BASE_URL = "https://www.rbi.org.in/Scripts/";

function loadPreviousData() {
  return loadDataFile(DATA_PATH, { lastChecked: null, notifications: [], pendingDates: {} });
}

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
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
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

/**
 * Fetch detail page to extract reference number, date, and summary text.
 */
async function fetchNotificationDetails(link) {
  try {
    const html = await fetchPage(link);

    // RBI prints the issue date in a right-aligned paragraph under the reference number.
    const date = extractScopedDate(html, [/<p align="?right"?>\s*([^<]{6,40}?)\s*<\/p>/i], link);

    // Extract Circular No (e.g., RBI/2026-27/203 or RBI/2026-2027/231)
    const refMatch = html.match(/(RBI\/\d{4}-\d{2,4}\/\d+[^\n<]*)/i);
    const circularNo = refMatch ? refMatch[1].trim() : null;

    // Extract PDF URL if missing
    const pdfMatch = html.match(/href=["\x27]?(https?:\/\/[^"\x27\s>]+\.pdf)/i);
    const pdfUrl = pdfMatch ? pdfMatch[1] : null;

    // Extract Paragraphs for summary
    const pMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const cleanParas = pMatches
      .map(p => p[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      .filter(t => t.length > 25 && !t.includes("RBI/") && !t.includes("Yours faithfully"));

    const summary = cleanParas.slice(0, 3).join("<br/><br/>");

    return { date, circularNo, pdfUrl, summary };
  } catch (err) {
    console.warn(`Failed to fetch details for ${link}:`, err.message);
    return { date: null, circularNo: null, pdfUrl: null, summary: "" };
  }
}

export async function checkRbiNotifications() {
  return withFileLock(DATA_PATH, runCheckRbiNotifications);
}

async function runCheckRbiNotifications() {
  console.log("🔍 Checking RBI Circulars & Notifications...");
  const html = await fetchPage(RBI_NOTIF_LIST_URL);

  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  const parsedItems = [];

  for (const r of rows) {
    const rowHtml = r[0];
    const linkMatch = rowHtml.match(/<a[^>]+href=["\x27]?([^"\x27\s>]*Id=[^"\x27\s>]+)["\x27]?[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const rawHref = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const link = rawHref.startsWith("http") ? rawHref : BASE_URL + rawHref.replace(/^\//, "").replace(/^scripts\//i, "");

      // ID from URL query param
      const idMatch = rawHref.match(/Id=(\d+)/i);
      const id = idMatch ? `rbi-notif-${idMatch[1]}` : link;

      const pdfMatch = rowHtml.match(/href=["\x27]?(https?:\/\/[^"\x27\s>]+\.pdf)/i);
      const pdfUrl = pdfMatch ? pdfMatch[1] : null;

      const date = extractDateString(rowHtml);

      parsedItems.push({ id, title, link, pdfUrl, date });
    }
  }

  const previousData = await loadPreviousData();
  assertNonZeroItems(parsedItems.length, previousData.notifications.length, "RBI Notifications");

  console.log(`Found ${parsedItems.length} RBI notifications on listing page.`);

  const prevIds = new Set(previousData.notifications.map(n => n.id || n.link));
  const newNotifications = [];
  const pendingDates = { ...previousData.pendingDates };

  for (const item of parsedItems) {
    if (!prevIds.has(item.id)) {
      console.log(`✨ New RBI Notification detected: ${item.title}`);
      
      // Fetch details for new notification
      const details = await fetchNotificationDetails(item.link);
      // No date on the detail page or the listing: retry on the next runs instead of
      // guessing today's date.
      const dated = (details.date || item.date) ? { date: details.date || item.date } : resolveMissingDate(item.id, pendingDates);
      if (!dated) continue;
      delete pendingDates[item.id];
      const fullItem = {
        ...item,
        ...dated,
        circularNo: details.circularNo,
        pdfUrl: item.pdfUrl || details.pdfUrl,
        summary: details.summary || item.title,
        detectedAt: new Date().toISOString()
      };
      
      newNotifications.push(fullItem);
      prevIds.add(item.id); // the listing can repeat a row; don't add it twice
    }
  }

  // Combine and update stored data
  const updatedList = [
    ...newNotifications,
    ...previousData.notifications.filter(p => !newNotifications.some(n => n.id === p.id))
  // Keep at least the latest 100, and never fewer than the listing shows: anything the
  // listing still shows but the file dropped would be re-detected as "new" every run.
  ].slice(0, Math.max(100, parsedItems.length));

  const payload = {
    lastChecked: new Date().toISOString(),
    count: updatedList.length,
    notifications: updatedList,
    pendingDates,
  };

  await writeDataFile(DATA_PATH, payload);
  console.log(`Updated data/rbi-notifications.json (${updatedList.length} total items).`);

  // Only dispatch instant alerts for items released today / within last 2 days,
  // ensuring older historical or cached notifications never send emails.
  const freshAlerts = newNotifications.filter(n => isFreshRelease(n.date, 2));

  if (freshAlerts.length > 0 && previousData.notifications.length > 0) {
    console.log(`✨ Detected ${freshAlerts.length} fresh RBI notification(s) issued today. Dispatching instant email alert...`);
    await sendRegulatoryAlert({
      source: "RBI",
      category: "Notification",
      updates: freshAlerts,
      categoryKey: "rbiNotifications"
    });
  } else if (newNotifications.length > 0 && freshAlerts.length === 0) {
    console.log(`ℹ️ ${newNotifications.length} cached/historical RBI notification(s) updated in database (no email sent).`);
  } else if (previousData.notifications.length === 0) {
    console.log("Initialized RBI notifications baseline data.");
  } else {
    console.log("No new RBI notifications detected.");
  }

  return newNotifications;
}

if (process.argv[1] && process.argv[1].endsWith("fetch-rbi-notifications.mjs")) {
  checkRbiNotifications().catch(err => {
    console.error("Fatal error in checkRbiNotifications:", err);
    process.exit(1);
  });
}
