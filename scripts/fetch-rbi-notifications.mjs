// Fetches latest RBI Circulars and Notifications from RBI website
// URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx
// Saves output to data/rbi-notifications.json
// Triggers real-time email alerts via email-notifier.mjs when new notifications are released.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sendRegulatoryAlert } from "./email-notifier.mjs";

const DATA_PATH = new URL("../data/rbi-notifications.json", import.meta.url);
const RBI_NOTIF_LIST_URL = "https://www.rbi.org.in/Scripts/NotificationUser.aspx";
const BASE_URL = "https://www.rbi.org.in/Scripts/";

async function loadPreviousData() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastChecked: null, notifications: [] };
  }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

/**
 * Fetch detail page to extract reference number, date, and summary text.
 */
async function fetchNotificationDetails(link) {
  try {
    const html = await fetchPage(link);

    // Extract Date
    const dateMatch = html.match(/<b>((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})<\/b>/i) ||
                      html.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i);
    const date = dateMatch ? dateMatch[1] : null;

    // Extract Circular No (e.g., RBI/2026-27/203)
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

      const dateMatch = rowHtml.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i);
      const date = dateMatch ? dateMatch[0] : null;

      parsedItems.push({ id, title, link, pdfUrl, date });
    }
  }

  console.log(`Found ${parsedItems.length} RBI notifications on listing page.`);

  const previousData = await loadPreviousData();
  const prevIds = new Set(previousData.notifications.map(n => n.id || n.link));
  const newNotifications = [];

  for (const item of parsedItems) {
    if (!prevIds.has(item.id)) {
      console.log(`✨ New RBI Notification detected: ${item.title}`);
      
      // Fetch details for new notification
      const details = await fetchNotificationDetails(item.link);
      const fullItem = {
        ...item,
        date: item.date || details.date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        circularNo: details.circularNo,
        pdfUrl: item.pdfUrl || details.pdfUrl,
        summary: details.summary || item.title,
        detectedAt: new Date().toISOString()
      };
      
      newNotifications.push(fullItem);
    }
  }

  // Combine and update stored data
  const updatedList = [
    ...newNotifications,
    ...previousData.notifications.filter(p => !newNotifications.some(n => n.id === p.id))
  ].slice(0, 100); // Keep latest 100

  const payload = {
    lastChecked: new Date().toISOString(),
    count: updatedList.length,
    notifications: updatedList
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`Updated data/rbi-notifications.json (${updatedList.length} total items).`);

  if (newNotifications.length > 0 && previousData.notifications.length > 0) {
    console.log(`✨ Detected ${newNotifications.length} new RBI notification(s). (Real-time email notification disabled)`);
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
