// Shared load/save helpers for the data/*.json files the fetch-*.mjs scrapers own.
// - A missing file (or the "{}" placeholder withFileLock creates) loads as `defaults`.
// - A file that exists but can't be parsed throws, so a truncated file is never
//   mistaken for an empty baseline and overwritten (losing all history).
// - Writes go to a temp file that is renamed into place, so a crash mid-write can't
//   leave truncated JSON behind.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, basename } from "node:path";

function toPath(target) {
  return target instanceof URL ? fileURLToPath(target) : target;
}

export async function loadDataFile(target, defaults) {
  const path = toPath(target);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return structuredClone(defaults);
    throw err;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${basename(path)} is not valid JSON (${err.message}). Refusing to overwrite it; restore it from git.`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${basename(path)} does not hold a JSON object. Refusing to overwrite it; restore it from git.`);
  }
  return { ...structuredClone(defaults), ...data };
}

export async function writeDataFile(target, data) {
  const path = toPath(target);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}
