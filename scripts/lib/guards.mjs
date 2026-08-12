// Shared 0-items guard for fetch-*.mjs scrapers.
// A scraper parsing 0 items after a baseline was already established almost
// always means the source page's layout changed, not that content disappeared.

export function assertNonZeroItems(currentCount, previousCount, label) {
  if (currentCount === 0 && previousCount > 0) {
    throw new Error(`${label} Scraper parsed 0 items. Page layout may have changed.`);
  }
}
