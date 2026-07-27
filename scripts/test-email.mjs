// Diagnostic script to test email notification setup
// Run with: npm run test:email or node scripts/test-email.mjs

import { sendRegulatoryAlert, getRecipients } from "./email-notifier.mjs";

async function testEmail() {
  const recipients = getRecipients();
  console.log("==================================================================");
  console.log("🧪 Testing Kreon RegPulse Email Alert Setup...");
  console.log(`📩 Target Recipients: ${recipients.join(", ")}`);
  console.log("==================================================================");

  const sampleUpdates = [
    {
      id: "test-rbi-1",
      title: "Special Rupee Vostro Accounts (SRVAs) Framework Update",
      link: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13581&Mode=0",
      pdfUrl: "https://rbidocs.rbi.org.in/rdocs/notification/PDFs/NOTI2033D4B28F9A3A54B548FF6B13A8E8F5355.PDF",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      summary: "This is a test notification verifying that instant regulatory update emails are properly formatted and delivered to umamaheswari.s@stucred.com, raghuraman@stucred.com & shubhrajyoti.c@stucred.com."
    }
  ];

  const result = await sendRegulatoryAlert({
    source: "RBI",
    category: "Notification Test",
    updates: sampleUpdates,
    customSubject: "🧪 Kreon RegPulse Test Email Alert: Instant Notifications Configured"
  });

  if (result.success) {
    console.log("\n🎉 TEST SUCCESSFUL! Email dispatched to recipients.");
  } else {
    console.log(`\n⚠️ Test completed with status: ${result.reason}`);
    console.log("Tip: Copy .env.example to .env and configure SMTP_HOST, SMTP_USER, and SMTP_PASS to enable live delivery.");
  }
}

testEmail().catch(err => {
  console.error("Error in testEmail:", err);
});
