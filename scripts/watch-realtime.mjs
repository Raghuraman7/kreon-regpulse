// Continuous Real-Time Watcher Daemon for RBI & SEBI Regulatory Updates
// Periodically polls RBI Notifications, RBI Master Directions, SEBI Regulations, and SEBI Circulars.
// Triggers INSTANT email notifications to umamaheswari.s@stucred.com, raghuraman@stucred.com & shubhrajyoti.c@stucred.com as soon as an update is released.
// Run with: node scripts/watch-realtime.mjs

import { checkRbiNotifications } from "./fetch-rbi-notifications.mjs";
import { checkSebiCirculars } from "./fetch-sebi-circulars.mjs";
import { checkRbiMasterDirections } from "./fetch-master-directions.mjs";
import { checkSebiRegulations } from "./fetch-sebi-regulations.mjs";
import { generateAndSendMonthlyDigest } from "./send-monthly-digest.mjs";
import { getRecipients } from "./email-notifier.mjs";

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS), 10);

let last15DaysDigestSentKey = "";
let lastMonthlyDigestSentKey = "";

async function checkAndSendPeriodicDigests() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const dateNum = now.getDate();
  const hours = now.getHours();

  const key15 = `${currentYear}-${currentMonth}-15`;
  const lastDayOfCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
  const keyMonthEnd = `${currentYear}-${currentMonth}-${lastDayOfCurrentMonth}`;

  // 15-Day Fortnightly Digest (Auto-triggers on 16th of month between 08:00 AM onwards)
  if (dateNum === 16 && hours >= 8 && last15DaysDigestSentKey !== key15) {
    console.log(`📅 15-Day Fortnightly trigger: Generating digest for 1st - 15th of current month...`);
    await generateAndSendPeriodicDigest({ period: "15days", month: currentMonth, year: currentYear });
    last15DaysDigestSentKey = key15;
  }

  // Full Month Digest (Auto-triggers on the last day of the current month: 28th, 29th, 30th, or 31st)
  if (dateNum === lastDayOfCurrentMonth && hours >= 8 && lastMonthlyDigestSentKey !== keyMonthEnd) {
    console.log(`📅 Full Month trigger: Generating digest for 1st - ${lastDayOfCurrentMonth}th of current month (${currentMonth}/${currentYear})...`);
    await generateAndSendPeriodicDigest({ period: "monthly", month: currentMonth, year: currentYear });
    lastMonthlyDigestSentKey = keyMonthEnd;
  }
}

async function runCheckCycle() {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  console.log(`\n==================================================================`);
  console.log(`⏰ [${timestamp} IST] Running Real-Time Regulatory Update Check...`);
  console.log(`==================================================================`);

  try {
    await checkRbiNotifications();
  } catch (err) {
    console.error("❌ RBI Notifications check error:", err.message);
  }

  try {
    await checkSebiCirculars();
  } catch (err) {
    console.error("❌ SEBI Circulars check error:", err.message);
  }

  try {
    await checkRbiMasterDirections();
  } catch (err) {
    console.error("❌ RBI Master Directions check error:", err.message);
  }

  try {
    await checkSebiRegulations();
  } catch (err) {
    console.error("❌ SEBI Regulations check error:", err.message);
  }

  try {
    await checkAndSendPeriodicDigests();
  } catch (err) {
    console.error("❌ Periodic Digest check error:", err.message);
  }

  console.log(`✅ Check cycle completed at ${new Date().toLocaleTimeString()}. Next check in ${POLL_INTERVAL_MS / 1000}s.`);
}

async function startDaemon() {
  const recipients = getRecipients();
  console.log("==================================================================");
  console.log("🚀 Kreon RegPulse Real-Time Continuous Watcher Started");
  console.log(`📩 Target Alert Recipients: ${recipients.join(", ")}`);
  console.log(`⏱ Polling Frequency: Every ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log("==================================================================");

  // Initial immediate check
  await runCheckCycle();

  // Schedule continuous loop
  setInterval(runCheckCycle, POLL_INTERVAL_MS);
}

startDaemon().catch(err => {
  console.error("Fatal error starting real-time watcher daemon:", err);
  process.exit(1);
});
