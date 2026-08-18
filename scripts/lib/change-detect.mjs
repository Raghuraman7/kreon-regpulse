// Shared change-detection helpers for slow-moving sources (Acts & Rules, Secretarial
// Standards) that don't share a common page template across issuers.
// Strategy: pull an explicit "last amended / effective from" statement out of the
// page to detect real statutory amendments without false alarms from HTML noise.

import { createHash } from "node:crypto";

const AMENDMENT_PATTERNS = [
  /\[?Last\s+amended\s+on[:\s]+([^\]<.\n]{3,120})\]?/i,
  /last\s+amend(?:ed|ment)[^.<\n]{0,25}(?:in|on|dated)\s*([^.<\n]{3,100})/i,
  /as\s+amended\s+(?:up\s*to|upto|on|by)\s*([^.<\n]{3,80})/i,
  /\(As\s+on\s+([^)]{3,80})\)/i,
  /(?:limited\s+)?revision[^.<\n]{0,25}effective\s+from\s+([^.,<\n]{3,60})/i,
  /effective\s+from\s+([^.,<\n]{3,60})/i,
  /with\s+effect\s+from\s+([^.,<\n]{3,60})/i,
  /w\.e\.f\.?\s+([^.,<\n]{3,60})/i,
  /amended\s+vide\s+notification[^.<\n]{3,80}/i,
];

export function extractAmendmentSignal(html) {
  if (!html) return null;
  for (const pattern of AMENDMENT_PATTERNS) {
    const m = html.match(pattern);
    if (m && m[1]) return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (m && m[0]) return m[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  return null;
}

export function contentHash(raw) {
  if (!raw) return "";
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<input[^>]+(?:VIEWSTATE|EVENTVALIDATION|CSRF)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(text).digest("hex");
}
