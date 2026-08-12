// Monthly Fetch Runner for Kreon RegPulse — Acts & Rules and Secretarial Standards only.
// These sources move at Parliament/ICSI's pace, not RBI/SEBI's, so they run on their own
// monthly schedule (see .github/workflows for the cron entry) instead of the 10-15 min
// watch-realtime.mjs loop or the 15-min RBI/SEBI GitHub Actions cron.

import { checkActsAndRules } from "./fetch-acts-rules.mjs";
import { checkSecretarialStandards } from "./fetch-secretarial-standards.mjs";

async function main() {
  console.log("==================================================================");
  console.log("🚀 Starting Monthly Regulatory Update Refresh (Acts & Rules, Secretarial Standards)...");
  console.log("==================================================================");

  try {
    await checkActsAndRules();
  } catch (err) {
    console.error("❌ Acts & Rules check error:", err.message);
  }

  try {
    await checkSecretarialStandards();
  } catch (err) {
    console.error("❌ Secretarial Standards check error:", err.message);
  }

  console.log("==================================================================");
  console.log("✅ Monthly Regulatory Update Refresh Completed.");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Fatal error running monthly fetch:", err);
  process.exit(1);
});
