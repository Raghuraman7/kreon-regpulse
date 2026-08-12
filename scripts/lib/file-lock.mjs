// Shared file-locking helper so overlapping cron + daemon runs can't corrupt
// the shared JSON data files with an interleaved read-modify-write cycle.

import lockfile from "proper-lockfile";
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

function toPath(target) {
  return target instanceof URL ? fileURLToPath(target) : target;
}

const LOCK_OPTIONS = {
  stale: 60000,
  retries: { retries: 10, factor: 1.5, minTimeout: 300, maxTimeout: 5000 },
};

/**
 * Runs fn() while holding an exclusive lock on targetPath, covering the whole
 * load -> compute -> write cycle so a concurrent run can't read stale data or
 * clobber a write in progress. Waits (rather than failing fast) if another
 * process already holds the lock.
 */
export async function withFileLock(target, fn) {
  const path = toPath(target);
  await mkdir(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    await writeFile(path, "{}");
  }

  const release = await lockfile.lock(path, LOCK_OPTIONS);
  try {
    return await fn();
  } finally {
    await release();
  }
}
