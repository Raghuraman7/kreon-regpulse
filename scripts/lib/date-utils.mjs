// Date parsing and freshness checking utility for Kreon RegPulse scrapers

const MONTH_REGEX_PART = "January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

/**
 * Extracts and formats a date from arbitrary HTML / text string.
 * Supports:
 * - "August 6, 2026", "Aug 06, 2026", "Aug 6 2026"
 * - "6 August 2026", "06-Aug-2026", "06/08/2026"
 * Returns formatted string like "Aug 6, 2026" or null.
 */
export function extractDateString(text) {
  if (!text) return null;

  // 1. "August 6, 2026" or "Aug 6, 2026"
  const m1 = text.match(new RegExp(`\\b(${MONTH_REGEX_PART})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i"));
  if (m1) {
    const month = m1[1].toLowerCase().slice(0, 3);
    const day = parseInt(m1[2], 10);
    const year = m1[3];
    const monthFormatted = month.charAt(0).toUpperCase() + month.slice(1);
    return `${monthFormatted} ${day}, ${year}`;
  }

  // 2. "6 August 2026" or "06-Aug-2026"
  const m2 = text.match(new RegExp(`\\b(\\d{1,2})[\\s\\-\\./]+(${MONTH_REGEX_PART})[\\s\\-\\./]+(\\d{4})\\b`, "i"));
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = m2[2].toLowerCase().slice(0, 3);
    const year = m2[3];
    const monthFormatted = month.charAt(0).toUpperCase() + month.slice(1);
    return `${monthFormatted} ${day}, ${year}`;
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const m3 = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (m3) {
    const day = parseInt(m3[1], 10);
    const monthNum = parseInt(m3[2], 10);
    const year = parseInt(m3[3], 10);
    if (monthNum >= 1 && monthNum <= 12 && day >= 1 && day <= 31 && year >= 2000) {
      const d = new Date(year, monthNum - 1, day);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }

  return null;
}

/**
 * Checks if a date string represents a recent release (within maxDays of now).
 * Used by instant alert triggers to ensure older backfilled policies/circulars
 * do not send real-time email alerts.
 *
 * @param {string} dateStr
 * @param {number} [maxDays=4]
 * @returns {boolean}
 */
export function isFreshRelease(dateStr, maxDays = 4) {
  if (!dateStr) return true; // If unknown date, default to allowing check
  
  const parsed = extractDateString(dateStr) || dateStr;
  const d = new Date(parsed);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  // Strip time part for fair day comparison
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const diffDays = (nowDate - itemDate) / (1000 * 60 * 60 * 24);

  // Allow if issued today, up to maxDays ago, or dated slightly ahead
  return diffDays <= maxDays;
}
