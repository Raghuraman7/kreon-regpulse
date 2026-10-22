// Shared guards for fetch-*.mjs scrapers.
// A scraper parsing far fewer items than its established baseline almost always
// means the source page's layout changed or the request was blocked, not that
// content disappeared.

export function assertNonZeroItems(currentCount, previousCount, label) {
  if (currentCount === 0 && previousCount > 0) {
    throw new Error(`${label} Scraper parsed 0 items. Page layout may have changed.`);
  }
}

/**
 * For scrapers that replace the whole dataset each run: refuse to write when the new
 * list is less than half the previous one (with a baseline of at least 4 items), so a
 * partial parse can't silently drop most of the register.
 */
export function assertNoMassDrop(currentCount, previousCount, label) {
  assertNonZeroItems(currentCount, previousCount, label);
  if (previousCount >= 4 && currentCount < previousCount / 2) {
    throw new Error(`${label} Scraper parsed ${currentCount} items, down from ${previousCount}. Page layout may have changed; keeping the previous data.`);
  }
}
