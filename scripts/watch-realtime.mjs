// Continuous Real-Time Watcher Daemon for RBI & SEBI Regulatory Updates
// Periodically polls RBI Notifications, RBI Master Directions, SEBI Regulations, and SEBI Circulars.
// Triggers INSTANT email notifications to umamaheswari.s@stucred.com, raghuraman@stucred.com & shubhrajyoti.c@stucred.com as soon as an update is released.
// Run with: node scripts/watch-realtime.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { checkRbiNotifications } from "./fetch-rbi-notifications.mjs";
import { checkSebiCirculars } from "./fetch-sebi-circulars.mjs";
import { checkRbiMasterDirections } from "./fetch-master-directions.mjs";
import { checkSebiRegulations } from "./fetch-sebi-regulations.mjs";
import { generateAndSendPeriodicDigest } from "./send-monthly-digest.mjs";
import { getRecipients, sendScraperHealthWarning } from "./email-notifier.mjs";
import { withFileLock } from "./lib/file-lock.mjs";

const DIGEST_STATE_PATH = new URL("../data/digest-state.json", import.meta.url);

// Send a dev/ops health warning after this many consecutive failed/empty check cycles for a source.
const FAILURE_ALERT_THRESHOLD = 3;

async function loadDigestState() {
  try {
    const raw = await readFile(DIGEST_STATE_PATH, "utf8");
    const state = JSON.parse(raw);
    state.failureStreaks = state.failureStreaks || {};
    state.healthAlertActive = state.healthAlertActive || {};
    return state;
  } catch {
    return { lastMonthlyDigestSentKey: "", failureStreaks: {}, healthAlertActive: {} };
  }
}

async function saveDigestState(state) {
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DIGEST_STATE_PATH, JSON.stringify(state, null, 2));
}

// Tracks per-source pass/fail streaks in data/digest-state.json and fires a single
// dev/ops health-warning email per outage (reset once the source succeeds again).
async function recordCheckResult(sourceKey, label, ok, errorMessage) {
  await withFileLock(DIGEST_STATE_PATH, async () => {
    const state = await loadDigestState();

    if (ok) {
      state.failureStreaks[sourceKey] = 0;
      state.healthAlertActive[sourceKey] = false;
      await saveDigestState(state);
      return;
    }

    const streak = (state.failureStreaks[sourceKey] || 0) + 1;
    state.failureStreaks[sourceKey] = streak;
    console.warn(`⚠ ${label} has now failed ${streak} consecutive check cycle(s).`);

    const alreadyAlerted = !!state.healthAlertActive[sourceKey];
    if (streak >= FAILURE_ALERT_THRESHOLD && !alreadyAlerted) {
      state.healthAlertActive[sourceKey] = true;
      await saveDigestState(state);
      await sendScraperHealthWarning({ source: sourceKey, label, consecutiveFailures: streak, lastError: errorMessage });
      return;
    }

    await saveDigestState(state);
  });
}

const DEFAULT_POLL_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes — polling more often risks an IP block from RBI/SEBI
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS), 10);

// Only poll during business hours (IST) by default — avoids hammering govt servers overnight.
const ACTIVE_HOURS_START = parseInt(process.env.ACTIVE_HOURS_START || "8", 10);
const ACTIVE_HOURS_END = parseInt(process.env.ACTIVE_HOURS_END || "20", 10);

function getISTHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === "hour").value, 10);
}

function isWithinActiveHours(date = new Date()) {
  const hour = getISTHour(date);
  return hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END;
}

async function checkAndSendPeriodicDigests() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const dateNum = now.getDate();
  const hours = getISTHour(now);

  const lastDayOfCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
  const keyMonthEnd = `${currentYear}-${currentMonth}-${lastDayOfCurrentMonth}`;

  // Locked so a concurrent daemon/cron run can't read the same pre-send state,
  // both send the digest, and race each other writing the "sent" key back.
  await withFileLock(DIGEST_STATE_PATH, async () => {
    const state = await loadDigestState();

    // Full Month Digest only (Auto-triggers on the last day of the current month: 28th, 29th, 30th, or 31st)
    if (dateNum === lastDayOfCurrentMonth && hours >= 8 && state.lastMonthlyDigestSentKey !== keyMonthEnd) {
      console.log(`📅 Full Month trigger: Generating digest for 1st - ${lastDayOfCurrentMonth}th of current month (${currentMonth}/${currentYear})...`);
      await generateAndSendPeriodicDigest({ month: currentMonth, year: currentYear });
      state.lastMonthlyDigestSentKey = keyMonthEnd;
      await saveDigestState(state);
    }
  });
}

async function runCheckCycle() {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  if (!isWithinActiveHours()) {
    console.log(`⏸ [${timestamp} IST] Outside active hours (${ACTIVE_HOURS_START}:00–${ACTIVE_HOURS_END}:00 IST). Skipping this check cycle.`);
    return;
  }

  console.log(`\n==================================================================`);
  console.log(`⏰ [${timestamp} IST] Running Real-Time Regulatory Update Check...`);
  console.log(`==================================================================`);

  const sources = [
    { key: "rbiNotifications", label: "RBI Notifications", fn: checkRbiNotifications },
    { key: "sebiCirculars", label: "SEBI Circulars", fn: checkSebiCirculars },
    { key: "rbiMasterDirections", label: "RBI Master Directions", fn: checkRbiMasterDirections },
    { key: "sebiRegulations", label: "SEBI Regulations", fn: checkSebiRegulations },
  ];

  for (const source of sources) {
    try {
      await source.fn();
      await recordCheckResult(source.key, source.label, true);
    } catch (err) {
      console.error(`❌ ${source.label} check error:`, err.message);
      await recordCheckResult(source.key, source.label, false, err.message);
    }
  }

  try {
    await checkAndSendPeriodicDigests();
  } catch (err) {
    console.error("❌ Periodic Digest check error:", err.message);
  }

  console.log(`✅ Check cycle completed at ${new Date().toLocaleTimeString()}. Next check in ${POLL_INTERVAL_MS / 1000}s.`);
}

async function startDaemon() {
  // Recipients are resolved per-category at send time (see email-notifier.mjs), so this
  // log shows the actual breakdown rather than a single flat list that could go stale.
  console.log("==================================================================");
  console.log("🚀 Kreon RegPulse Real-Time Continuous Watcher Started");
  console.log(`📩 CS + CEO recipients (Master Directions, SEBI Regs, Acts, Secretarial Standards): ${getRecipients("rbiMasterDirections").join(", ")}`);
  console.log(`📩 CEO-only recipients (RBI Notifications, SEBI Circulars): ${getRecipients("rbiNotifications").join(", ")}`);
  console.log(`⏱ Polling Frequency: Every ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log(`🕐 Active Hours: ${ACTIVE_HOURS_START}:00–${ACTIVE_HOURS_END}:00 IST (checks are skipped outside this window)`);
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
