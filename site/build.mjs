#!/usr/bin/env node
/**
 * Static site build for Kreon RegPulse.
 *
 * Reads data/*.json (written by the fetch scripts), validates every item, and
 * writes plain HTML pages to dist/. Pages ship zero JavaScript except /search/.
 * Run `npm run build` (this script + Pagefind indexing).
 *
 * SITE_ENV=test adds a "TEST BUILD" banner and noindex to every page.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPLIANCE_GISTS, COMPLIANCE_AMENDMENTS, RBI_TOPIC_RULES, SEBI_TOPICS, PREVIEW_DATA,
  REGISTER_COPY, FRESHNESS_COPY, COMPLIANCE_NOTE, NOT_AFFILIATED, COPYRIGHT, CONTENT_REVIEWS,
} from "./content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT = path.join(ROOT, "dist");
const IS_TEST = process.env.SITE_ENV === "test";
const BUILD_TIME = new Date();
const TZ = "Asia/Kolkata";
const RECENTLY_UPDATED_WINDOW_DAYS = 14;
// The register that opens at "/" (for now RBI Master Directions; the RBI tab stays highlighted).
const LANDING_REGISTER = "rbi-md";

// ---------------------------------------------------------------------------
// Registers: one per data file. `color` maps to the per-type colour tokens.
// Each belongs to a provider (a top-level section); a provider with several
// registers shows them as tabs, e.g. RBI → Master Directions | Notifications.
// ---------------------------------------------------------------------------

const PROVIDERS = [
  { key: "rbi", name: "RBI", full: "Reserve Bank of India" },
  { key: "sebi", name: "SEBI", full: "Securities and Exchange Board of India" },
  { key: "acts", name: "Acts & Rules", full: "Acts & Rules" },
  { key: "ss", name: "Standards", full: "Secretarial Standards (ICSI)" },
];

const REGISTERS = [
  {
    key: "rbi-md", file: "master-directions.json", listKey: "directions",
    slug: "rbi", provider: "rbi", tab: "Master Directions", plain: "RBI's main rulebooks for NBFCs. Each one is kept up to date as the rules change.", name: "RBI Master Directions", badge: "RBI Direction",
    color: "c", regulator: "RBI", freshness: "live", freshnessNote: FRESHNESS_COPY.live,
    desc: REGISTER_COPY.rbiMd, dateLabel: "Issued",
    sourceUrl: "https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx?did=411",
  },
  {
    key: "rbi-notif", file: "rbi-notifications.json", listKey: "notifications",
    slug: "rbi/notifications", provider: "rbi", tab: "Notifications", plain: "Every new instruction RBI publishes, including changes to the Master Directions.", name: "RBI Notifications", badge: "RBI Notification",
    color: "a", regulator: "RBI", freshness: "live", freshnessNote: FRESHNESS_COPY.live,
    desc: REGISTER_COPY.rbiNotif, dateLabel: "Issued",
    sourceUrl: "https://www.rbi.org.in/Scripts/NotificationUser.aspx",
  },
  {
    key: "sebi-reg", file: "sebi-regulations.json", listKey: "regulations",
    slug: "sebi", provider: "sebi", tab: "Regulations", plain: "SEBI's rulebooks (regulations) that we track, in their latest amended version.", name: "SEBI Regulations", badge: "SEBI Regulation",
    color: "d", regulator: "SEBI", freshness: "live", freshnessNote: FRESHNESS_COPY.live,
    desc: REGISTER_COPY.sebiReg, dateLabel: "Last amended",
    sourceUrl: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3&smid=0",
  },
  {
    key: "sebi-circ", file: "sebi-circulars.json", listKey: "circulars",
    slug: "sebi/circulars", provider: "sebi", tab: "Circulars", plain: "SEBI's day-to-day instructions, clarifications and relaxations.", name: "SEBI Circulars", badge: "SEBI Circular",
    color: "b", regulator: "SEBI", freshness: "live", freshnessNote: FRESHNESS_COPY.live,
    desc: REGISTER_COPY.sebiCirc, dateLabel: "Issued",
    sourceUrl: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0",
  },
  {
    key: "acts", file: "acts-rules.json", listKey: "acts",
    slug: "acts-rules", provider: "acts", tab: "Acts & Rules", plain: "The laws passed by Parliament, and rules made under them, that the regulations rely on.", name: "Acts & Rules", badge: "Act / Rules",
    color: "e", regulator: "Law", freshness: "monthly", freshnessNote: FRESHNESS_COPY.actsMonthly,
    desc: REGISTER_COPY.acts, dateLabel: "Enacted", dateOptional: true,
    sourceUrl: "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/acts.html",
  },
  {
    key: "ss", file: "secretarial-standards.json", listKey: "standards",
    slug: "secretarial-standards", provider: "ss", tab: "Secretarial Standards", plain: "ICSI's standards for board meetings, general meetings, minutes and dividends.", name: "Secretarial Standards", badge: "ICSI Standard",
    color: "f", regulator: "ICSI", freshness: "monthly", freshnessNote: FRESHNESS_COPY.ssMonthly,
    desc: REGISTER_COPY.ss, dateLabel: "Effective", dateOptional: true,
    sourceUrl: "https://www.icsi.edu/knowledgebase/secretarial-standards/",
  },
];

// ---------------------------------------------------------------------------
// Helpers carried over from the previous UI (same rules, same wording).
// ---------------------------------------------------------------------------

function isNbfcRelevant(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes("nbfc") || t.includes("non-banking financial") || t.includes("non banking financial") || t.includes("nbf company") || t.includes("housing finance");
}

function determineSbrLayers(title) {
  const t = title.toLowerCase();
  if (t.includes("public deposit") || t.includes("acceptance of deposit")) return "Middle & Upper Layer (Deposit-Taking)";
  if (t.includes("outsourcing") || t.includes("asset liability") || t.includes("concentration risk") || t.includes("risk management") || t.includes("securitisation")) return "Middle & Upper Layer (ML/UL Only)";
  if (t.includes("know your customer") || t.includes("kyc") || t.includes("fair practice") || t.includes("responsible business") || t.includes("registration, exemption")) return "All Layers (Base, Middle & Upper)";
  if (t.includes("capital adequacy") || t.includes("prudential norms on capital")) return "All Layers (BL Leverage Ratio / ML 15% CRAR)";
  return "All Layers (Applicable to NBFC-ICC)";
}

/** Name of the subject group a set of notes was written for: the first rule label for that topic key. */
function topicName(key) {
  return RBI_TOPIC_RULES.find((r) => r.topic === key)?.label || key;
}

function classifyDirection(title) {
  for (const rule of RBI_TOPIC_RULES) {
    if (rule.pattern.test(title)) return { topic: rule.topic, label: rule.label };
  }
  return { topic: "other", label: "Other" };
}

function extractUpdatedDate(title) {
  const m = title.match(/[Uu]pdated as on\s+([A-Za-z]+ \d{1,2},? \d{4})/);
  return m ? m[1] : null;
}

function cleanTitle(title) {
  return title.replace(/\s*\((?:[Uu]pdated|updated)\s+as\s+on\s+[^)]+\)\s*$/, "").trim();
}

/**
 * Who an RBI direction is addressed to, read from its title: RBI's directions are titled
 * "Reserve Bank of India (<Entity> – <Subject>) Directions", e.g. "(Commercial Banks – Fraud Risk Management)".
 * Returns null when the bracket names a subject rather than a type of entity.
 */
function addressedTo(title) {
  const m = title.match(/^Reserve Bank of India \(([^()]+?)\s+[–-]\s+/);
  const entity = m?.[1].trim();
  return entity && /(Banks?|Financial Institutions|Companies)$/i.test(entity) ? entity : null;
}
const isNbfcEntity = (entity) => /Non-Banking Financial|NBFC|Housing Finance/i.test(entity);

const isPdf = (url) => !!url && url.toLowerCase().endsWith(".pdf");

// ---------------------------------------------------------------------------
// Dates: stored as ISO, shown as DD MMM YYYY in IST.
// ---------------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON_INDEX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

/** Calendar date in IST from an ISO timestamp, a YYYY-MM-DD date or "Mon D, YYYY". */
function parseCalendarDate(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" })
        .formatToParts(d).map((p) => [p.type, p.value]),
    );
    return { y: +parts.year, m: +parts.month, d: +parts.day };
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MON_INDEX[m[1].slice(0, 3).toLowerCase()];
    return mon ? validDate(+m[3], mon, +m[2]) : null;
  }
  return null;
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? { y, m, d } : null;
}

const isoDate = (c) => `${c.y}-${pad(c.m)}-${pad(c.d)}`;
const fmtDate = (c) => `${pad(c.d)} ${MON[c.m - 1]} ${c.y}`;
const dateValue = (c) => Date.UTC(c.y, c.m - 1, c.d);

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${pad(p.day)} ${MON[p.month - 1]} ${p.year}, ${p.hour}:${p.minute} IST`;
}

const todayIst = parseCalendarDate(BUILD_TIME.toISOString());
const daysAgo = (c) => (dateValue(todayIst) - dateValue(c)) / 86400000;

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

function slugify(s) {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extLink(url, label, sourceName = host(url)) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Official source: ${esc(sourceName)} (opens in a new tab)">${label}<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
}

/** Scraped summaries contain literal <br/> tags; turn them into paragraphs, escape everything else. */
function paragraphs(text) {
  return String(text || "")
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

const plain = (text) => String(text || "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Load, validate and normalise
// ---------------------------------------------------------------------------

const errors = [];

function fail(reg, raw, msg) {
  errors.push(`${reg.file} → ${raw?.id ?? raw?.key ?? "(no id)"}: ${msg}`);
}

function checkUrl(reg, raw, field, required) {
  const v = raw[field];
  if (v == null || v === "") {
    if (required) fail(reg, raw, `missing ${field}`);
    return;
  }
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) fail(reg, raw, `${field} is not http(s): ${v}`);
  } catch {
    fail(reg, raw, `${field} is not a valid URL: ${v}`);
  }
}

function normalise(reg, raw) {
  if (!raw || typeof raw !== "object") return fail(reg, raw, "item is not an object");
  if (typeof raw.title !== "string" || !raw.title.trim()) fail(reg, raw, "missing title");
  checkUrl(reg, raw, "link", true);
  checkUrl(reg, raw, "pdfUrl", false);

  const base = { register: reg, raw, link: raw.link, title: (raw.title || "").trim() };

  switch (reg.key) {
    case "rbi-md": {
      const cls = classifyDirection(raw.title);
      const officialId = (raw.link || "").match(/[?&]id=(\d+)/i)?.[1];
      return {
        ...base,
        id: officialId ? `rbi-md-${officialId}` : raw.id,
        title: cleanTitle(raw.title),
        dateStr: raw.issuedDate,
        pdfUrl: isPdf(raw.pdfUrl) ? raw.pdfUrl : null,
        topics: [cls.label],
        topicKey: cls.topic,
        layer: determineSbrLayers(raw.title),
        // The hand-written overview and key points are per subject, not per direction,
        // so they are shown as general notes on the subject, never as this direction's text.
        summaryText: "",
        topicNotes: { key: cls.topic, overview: PREVIEW_DATA[cls.topic] || null, points: COMPLIANCE_GISTS[cls.topic] || null },
        trackRecent: true,
        details: [
          ["Applicable to", raw.applicableTo],
          ["Updated as on", extractUpdatedDate(raw.title)],
          ["Date as published", raw.issuedDateRaw !== extractUpdatedDate(raw.title) ? raw.issuedDateRaw : null],
        ],
        notice: COMPLIANCE_NOTE,
      };
    }
    case "rbi-notif": {
      const nbfc = isNbfcRelevant(raw.title + " " + (raw.summary || ""));
      const addressee = addressedTo(raw.title);
      return {
        ...base,
        id: raw.id,
        addressee,
        otherEntity: !!addressee && !isNbfcEntity(addressee),
        dateStr: raw.date,
        number: raw.circularNo || null,
        pdfUrl: isPdf(raw.pdfUrl) ? raw.pdfUrl : null,
        nbfc,
        topics: [nbfc ? "NBFC-ICC Impact" : "General Financial Sector"],
        excerpt: true,
        summaryHtml: paragraphs(raw.summary),
        summaryText: plain(raw.summary),
        detectedAt: raw.detectedAt,
      };
    }
    case "sebi-reg": {
      const topic = SEBI_TOPICS[raw.key] || { label: "Regulations" };
      return {
        ...base,
        id: `sebi-reg-${raw.key}`,
        dateStr: raw.amendedDate,
        pdfUrl: isPdf(raw.pdfUrl) ? raw.pdfUrl : null,
        topics: [topic.label],
        summaryHtml: PREVIEW_DATA[raw.key] ? `<p>${esc(PREVIEW_DATA[raw.key])}</p>` : null,
        summaryText: PREVIEW_DATA[raw.key] || "",
        docNotes: COMPLIANCE_GISTS[raw.key] ? { key: raw.key, lines: COMPLIANCE_GISTS[raw.key] } : null,
        amendKeys: [raw.key],
        trackRecent: true,
        details: [["Short name", raw.shortName]],
        lastCheckedAt: raw.lastUpdated,
      };
    }
    case "sebi-circ":
      return {
        ...base,
        id: raw.id,
        dateStr: raw.date,
        pdfUrl: isPdf(raw.pdfUrl) ? raw.pdfUrl : null,
        topics: ["Capital Markets"],
        excerpt: true,
        summaryHtml: paragraphs(raw.summary),
        summaryText: plain(raw.summary),
        details: [["Department", raw.department]],
        detectedAt: raw.detectedAt,
      };
    case "acts":
      return {
        ...base,
        id: raw.id,
        dateStr: raw.enactedDate,
        pdfUrl: raw.pdfUrl || null,
        topics: ["Corporate Law"],
        summaryHtml: paragraphs(raw.summary),
        summaryText: plain(raw.summary),
        docNotes: COMPLIANCE_GISTS[raw.id] ? { key: raw.id, lines: COMPLIANCE_GISTS[raw.id] } : null,
        amendKeys: [raw.id],
        trackRecent: true,
        details: [["Type", raw.type], ["Last amended", raw.lastAmended]],
        lastCheckedAt: raw.checkMeta?.lastCheckedAt,
        contentHash: raw.checkMeta?.contentHash,
        amendedSignal: raw.checkMeta?.amendedSignal,
      };
    case "ss": {
      // Keys are "ss1", "ss2", …; pages and notes use "ss-1", "ss-2", ….
      const id = `ss-${String(raw.key).replace(/^ss-?/i, "")}`;
      // SS-1 and SS-2 are mandatory under Section 118(10) of the Companies Act, 2013; the rest are recommendatory.
      const basis = /^ss-[12]$/.test(id) ? "Mandatory under Companies Act Sec 118(10)" : "Recommendatory (not mandated by Sec 118(10))";
      return {
        ...base,
        id,
        basis,
        dateStr: raw.effectiveDate,
        pdfUrl: raw.pdfUrl || null,
        topics: ["Board Governance"],
        summaryHtml: paragraphs(raw.summary),
        summaryText: plain(raw.summary),
        docNotes: COMPLIANCE_GISTS[id] ? { key: id, lines: COMPLIANCE_GISTS[id] } : null,
        amendKeys: [id],
        trackRecent: true,
        details: [["Issued by", raw.issuedBy], ["Version", raw.lastAmended], ["Status", basis]],
        lastCheckedAt: raw.checkMeta?.lastCheckedAt,
        contentHash: raw.checkMeta?.contentHash,
        amendedSignal: raw.checkMeta?.amendedSignal,
      };
    }
  }
}

async function loadAll() {
  const items = [];
  const fileMeta = {};
  for (const reg of REGISTERS) {
    const json = JSON.parse(await fs.readFile(path.join(DATA_DIR, reg.file), "utf8"));
    let list = json[reg.listKey];
    if (list && !Array.isArray(list) && typeof list === "object") list = Object.values(list);
    if (!Array.isArray(list)) {
      errors.push(`${reg.file}: expected "${reg.listKey}" to be a list`);
      continue;
    }
    fileMeta[reg.key] = json.generatedAt || json.lastChecked || null;
    reg.count = 0;
    for (const raw of list) {
      const item = normalise(reg, raw);
      if (!item) continue;
      if (!item.id) { fail(reg, raw, "missing id/key"); continue; }
      // Monthly registers may legitimately lack a date at source; a date that is present must parse.
      const missing = item.dateStr == null || item.dateStr === "";
      item.date = missing ? null : parseCalendarDate(item.dateStr);
      if (!item.date && !(missing && reg.dateOptional)) {
        fail(reg, raw, `${missing ? "missing" : "unparseable"} ${reg.dateLabel.toLowerCase()} date: ${JSON.stringify(item.dateStr)}`);
        continue;
      }
      item.url = `/doc/${slugify(item.id)}/`;
      item.recent = !!item.trackRecent && !!item.date && daysAgo(item.date) >= 0 && daysAgo(item.date) <= RECENTLY_UPDATED_WINDOW_DAYS;
      item.topicLinks = item.topics.map((label) => ({ label, slug: slugify(label) }));
      reg.count++;
      items.push(item);
    }
  }
  const seen = new Map();
  for (const it of items) {
    if (seen.has(it.url)) errors.push(`duplicate page URL ${it.url} (${seen.get(it.url).register.file} and ${it.register.file})`);
    seen.set(it.url, it);
  }
  if (errors.length) {
    console.error(`\n✖ Build stopped: ${errors.length} invalid data item(s). Nothing was written.\n`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  attachChanges(items);
  linkAmendments(items);
  flagDataProblems(items);
  if (errors.length) {
    console.error(`\n✖ Build stopped: ${errors.length} problem(s) in site/content.mjs. Nothing was written.\n`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  return { items: items.sort(compareItems), fileMeta };
}

const linkKey = (url) => {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, "") + u.pathname + u.search).toLowerCase(); } catch { return String(url).toLowerCase(); }
};

/**
 * Put each hand-written amendment note on the document it is about. Notes filed under a
 * document's own key (an Act, a Standard, a SEBI regulation) go to that document; notes
 * filed under an RBI subject go to the document their link points to, and nowhere else.
 */
function attachChanges(items) {
  const byLink = new Map(items.map((it) => [linkKey(it.link), it]));
  for (const [key, group] of Object.entries(COMPLIANCE_AMENDMENTS)) {
    for (const c of group.changes) {
      const owner = items.find((it) => it.amendKeys?.includes(key)) || (c.link && byLink.get(linkKey(c.link)));
      if (owner) (owner.changes ||= []).push({ ...c, key, lastUpdated: group.lastUpdated });
    }
  }
}

/** "(<Entity> – <Subject>)" from an RBI direction title, or null. */
function entityAndSubject(title) {
  const m = title.match(/^Reserve Bank of India \(([^()]+?)\s+[–-]\s+([^()]+)\)/);
  return m ? { entity: m[1].trim(), subject: m[2].trim().toLowerCase() } : null;
}

/**
 * Link RBI amendment notifications to the NBFC Master Direction they amend. RBI titles both
 * the same way: "(Non-Banking Financial Companies – Concentration Risk Management) Fourth
 * Amendment Directions" amends "(Non-Banking Financial Companies – Concentration Risk
 * Management) Directions". Only titles containing "Amendment" count, so separate directions
 * that merely share a subject (e.g. "… Miscellaneous) Supervisory Directions") are not linked.
 */
function linkAmendments(items) {
  const directions = items.filter((it) => it.register.key === "rbi-md")
    .map((it) => ({ it, es: entityAndSubject(it.raw.title) })).filter((x) => x.es);
  for (const n of items) {
    if (n.register.key !== "rbi-notif" || !/\bAmendment\b/i.test(n.title)) continue;
    const es = entityAndSubject(n.title);
    if (!es || !isNbfcEntity(es.entity)) continue;
    const target = directions.find((d) => d.es.subject === es.subject && isNbfcEntity(d.es.entity));
    if (!target) continue;
    n.amends = target.it;
    (target.it.amendedBy ||= []).push(n);
  }
}

/** Problems visible in the source data itself, shown as red flags so nobody relies on them unknowingly. */
function flagDataProblems(items) {
  // Notifications and circulars legitimately reuse titles (e.g. "Risk Management and Inter-Bank
  // Dealings" for separate circulars); among rulebooks a repeated title signals a source error.
  const RULEBOOKS = new Set(["rbi-md", "sebi-reg", "acts", "ss"]);
  const byTitle = new Map();
  for (const it of items) {
    if (!RULEBOOKS.has(it.register.key)) continue;
    const key = it.register.key + "|" + it.title.toLowerCase().replace(/\s+/g, " ");
    byTitle.set(key, [...(byTitle.get(key) || []), it]);
  }
  for (const group of byTitle.values()) {
    if (group.length > 1) for (const it of group) (it.flags ||= []).push({
      label: "Duplicate title at source",
      why: `${group.length} entries in ${it.register.name} share this title. Open the official PDF to confirm which document this is.`,
    });
  }
  for (const it of items) {
    if (!it.date) (it.flags ||= []).push({ label: "No date at source", why: `The official listing gives no ${it.register.dateLabel.toLowerCase()} date for this entry.` });
    // Set by the scrapers when the official page showed no date after several tries.
    if (it.raw.dateSource === "first-seen") (it.flags ||= []).push({
      label: "Date is when first seen",
      why: `The official page showed no ${it.register.dateLabel.toLowerCase()} date, so this is the date RegPulse first saw it. Check the PDF for the actual date.`,
    });
  }
}

const numCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
function compareItems(a, b) {
  // Undated entries sort after dated ones.
  return (b.date ? dateValue(b.date) : -Infinity) - (a.date ? dateValue(a.date) : -Infinity)
    || numCollator.compare(b.number || "", a.number || "")
    || numCollator.compare(a.title, b.title);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** "Issued <time>11 Sep 2026</time>", or a plain note when the source gives no date. */
function dateHtml(it, withLabel = true) {
  if (!it.date) return `${esc(it.register.dateLabel)} date not stated at source`;
  return `${withLabel ? esc(it.register.dateLabel) + " " : ""}<time datetime="${isoDate(it.date)}">${fmtDate(it.date)}</time>`;
}

/**
 * What the document is, then what needs attention first: data problems,
 * and plain-language hints (new, mentions NBFCs, addressed to another type of entity).
 */
function tagRow(it, { number = false } = {}) {
  const tags = [`<span class="badge t-${it.register.color}">${esc(it.register.badge)}</span>`];
  if (number && it.number) tags.push(`<span class="num">${esc(it.number)}</span>`);
  for (const f of it.flags || []) tags.push(`<span class="chip flag" title="${esc(f.why)}">⚑ ${esc(f.label)}</span>`);
  if (it.recent) tags.push(`<span class="chip ok" title="Issued or amended in the last ${RECENTLY_UPDATED_WINDOW_DAYS} days">New</span>`);
  if (it.nbfc) tags.push(`<span class="chip accent" title="The title or summary mentions NBFCs, non-banking financial companies or housing finance (word match)">Mentions NBFCs</span>`);
  if (it.otherEntity) tags.push(`<span class="chip" title="RBI addressed this to ${esc(it.addressee)}, per its title. Check before setting it aside.">For ${esc(it.addressee)}</span>`);
  return `<div class="tags">${tags.join("")}</div>`;
}

/**
 * "View PDF" link. PDFs open in the browser's own viewer in a new tab (which has its own
 * download button). For hosts that force a download, `viewUrl` is a copy served by this site.
 */
function viewPdfLink(it, label = "View PDF", cls = "") {
  const url = it.viewUrl || it.pdfUrl;
  return `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Opens the official PDF from ${esc(host(it.pdfUrl))} in your browser's viewer; use its download button to save a copy">${label}<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
}

const viewSiteLink = (it, label = `View on ${esc(host(it.link))}`, cls = "") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${esc(it.link)}" target="_blank" rel="noopener noreferrer" title="Opens the official page on ${esc(host(it.link))}">${label}<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;

/** The one official link a reader needs in a list: the PDF when there is one, else the regulator's page. */
function officialLink(it) {
  return it.pdfUrl ? viewPdfLink(it) : viewSiteLink(it);
}

const SEP = `<span class="sep" aria-hidden="true"> · </span>`;

function feedEntry(it) {
  return `<article class="entry">
  <div class="entry-date" aria-hidden="true">${it.date ? `<span class="day">${pad(it.date.d)}</span><span class="my">${MON[it.date.m - 1]} ${it.date.y}</span>` : `<span class="day">—</span>`}</div>
  <div class="entry-body">
    ${tagRow(it)}
    <h3 class="entry-title"><a href="${it.url}">${esc(it.title)}</a></h3>
    <p class="evidence"><span class="sr-only">${dateHtml(it)}. </span>${officialLink(it)}</p>
  </div>
</article>`;
}

function listItem(it, level = 2) {
  return `<li class="item">
  ${tagRow(it)}
  <h${level} class="item-title"><a href="${it.url}">${esc(it.title)}</a></h${level}>
  <p class="evidence">${dateHtml(it)}${SEP}${officialLink(it)}</p>
</li>`;
}

const backLink = (href, label) => `<p class="back"><a href="${href}"><span aria-hidden="true">← </span>${esc(label)}</a></p>`;

function kv(rows) {
  const filtered = rows.filter(([, v]) => v != null && v !== "");
  if (!filtered.length) return "";
  return `<dl class="kv">${filtered.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

// Panel headings are page furniture, so they stay out of search excerpts.
const panel = (id, title, body, attrs = "") =>
  body ? `<section class="panel" aria-labelledby="${id}"${attrs}><h2 id="${id}" data-pagefind-ignore>${esc(title)}</h2>${body}</section>` : "";

const notice = (variant, body) => `<div class="notice ${variant}" role="note">${body}</div>`;

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const providerOf = (reg) => PROVIDERS.find((p) => p.key === reg.provider);
const providerRegisters = (key) => REGISTERS.filter((r) => r.provider === key);

const NAV = [
  ...PROVIDERS.map((p) => ({ href: `/${providerRegisters(p.key)[0].slug}/`, label: p.name, key: p.key })),
  { href: "/notifications/", label: "Notifications", key: "notifications" },
];

let LAST_CHECKED = null;
const STALE_AFTER_HOURS = 24;

const ageText = (hours) => (hours < 48 ? `${Math.floor(hours)} hours ago` : `${Math.floor(hours / 24)} days ago`);

/**
 * "Data may be out of date" warning, checked every time a page is opened. A build only happens
 * when new data arrives, so if fetching stops the pages stop changing too; the warning therefore
 * can't rely on build time alone. A tiny inline script compares the last source check with the
 * viewer's clock; without JavaScript the build-time result is shown instead.
 */
function staleNotice() {
  if (!LAST_CHECKED) return "";
  const hours = (BUILD_TIME - new Date(LAST_CHECKED)) / 3600000;
  return `<div class="notice flag" id="stale" role="alert"${hours > STALE_AFTER_HOURS ? "" : " hidden"}><strong>Data may be out of date.</strong> Sources were last checked ${fmtDateTime(LAST_CHECKED)} (<span id="stale-age">${ageText(hours)}</span>). Recent updates may be missing; tell the tech team.</div>
<script>(function () {
  var h = (Date.now() - ${Date.parse(LAST_CHECKED)}) / 36e5, el = document.getElementById("stale");
  el.hidden = h <= ${STALE_AFTER_HOURS};
  document.getElementById("stale-age").textContent = h < 48 ? Math.floor(h) + " hours ago" : Math.floor(h / 24) + " days ago";
})();</script>
`;
}

// Browsers that support it prerender a same-site page once the pointer rests on its link
// (or presses it), so moving between pages feels instant. Plain JSON, not a script; other
// browsers ignore it. PDFs and the search page (which fetches data) are left out.
const SPECULATION_RULES = JSON.stringify({
  prerender: [{
    where: { and: [{ href_matches: "/*" }, { not: { href_matches: ["/files/*", "/search/*", "/pagefind/*"] } }] },
    eagerness: "moderate",
  }],
});

function page({ title, description, nav, body, wide = false, head = "", scripts = "", progress = false }) {
  const fullTitle = title ? `${title} · Kreon RegPulse` : "Kreon RegPulse · Compliance Register";
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#fbfbfc" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e131a" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || "Unified register of RBI, SEBI, Acts & Rules and ICSI compliance updates for CS/compliance teams.")}">
<link rel="preload" href="/assets/fonts/literata-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
<link rel="icon" href="/assets/kreon-logo.png" type="image/png">
<script type="speculationrules">${SPECULATION_RULES}</script>
${head}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${IS_TEST ? `<div class="test-banner" role="note"><strong>TEST BUILD</strong> — not for public use · sample data, not reviewed</div>\n` : ""}<header class="site-header">
  <div class="wrap${wide ? " wide" : ""} header-inner">
    <a class="brand" href="/"><img src="/assets/kreon-logo.png" alt="" width="28" height="28"><strong>Kreon RegPulse</strong></a>
    <nav class="main-nav" aria-label="Main">
      <ul>${NAV.map((n) => `<li><a href="${n.href}"${n.key === nav ? ` aria-current="page"` : ""}>${n.label}</a></li>`).join("")}</ul>
    </nav>
    <a class="search-link" href="/search/" title="Search all documents"${nav === "search" ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4.2-4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">Search</span></a>
  </div>
</header>
${progress ? `<div class="read-progress" aria-hidden="true"></div>
` : ""}<main id="main" tabindex="-1">
<div class="wrap${wide ? " wide" : ""}">
${staleNotice()}${body}
</div>
</main>
<footer class="site-footer">
  <div class="wrap${wide ? " wide" : ""}">
    ${LAST_CHECKED ? `<p>Sources last checked <time datetime="${esc(LAST_CHECKED)}">${fmtDateTime(LAST_CHECKED)}</time></p>` : ""}
    <ul class="footer-links">
      <li><a href="/about/"${nav === "about" ? ` aria-current="page"` : ""}>How it works</a></li>
      <li><a href="/search/">Search</a></li>
    </ul>
    <p class="copyright">${esc(COPYRIGHT)}</p>
  </div>
</footer>
${scripts}</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function groupByMonth(items) {
  const groups = [];
  for (const it of items) {
    const key = it.date ? `${it.date.y}-${pad(it.date.m)}` : "undated";
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      groups.push((g = { key, label: it.date ? `${MONTH_FULL[it.date.m - 1]} ${it.date.y}` : "Date not stated at source", items: [] }));
    }
    g.items.push(it);
  }
  return groups;
}

// Notifications "Last 12 months" covers this many months, counting the current one.
const RECENT_MONTHS = 12;

/**
 * Every update from every provider in one feed, newest first. `view` is "recent" (last 12
 * months, the default), "older" (everything before that, plus undated entries), or a
 * provider key ("rbi", "sebi", "acts", "ss") for all of that provider's updates.
 */
function notificationsPage(items, view = "recent") {
  const since = { y: todayIst.y, m: todayIst.m - (RECENT_MONTHS - 1), d: 1 };
  while (since.m < 1) { since.m += 12; since.y -= 1; }
  const isRecent = (it) => it.date && dateValue(it.date) >= dateValue(since);
  const provider = PROVIDERS.find((p) => p.key === view);
  const feed = view === "recent" ? items.filter(isRecent)
    : view === "older" ? items.filter((it) => !isRecent(it))
    : items.filter((it) => it.register.provider === view);
  const olderCount = items.filter((it) => !isRecent(it)).length;
  const groups = groupByMonth(feed);
  const show = [
    { href: "/notifications/", label: `Last ${RECENT_MONTHS} months`, key: "recent", n: items.filter(isRecent).length },
    ...PROVIDERS.map((p) => ({ href: `/notifications/${p.key}/`, label: p.name, key: p.key, n: items.filter((it) => it.register.provider === p.key).length })),
  ];
  const body = `
<div class="masthead">
  <h1>${view === "older" ? "Older notifications" : "Notifications"}</h1>
  <p class="lede">${view === "older"
    ? `Updates from before ${fmtDate(since)}, and entries with no date at source, newest first.`
    : "Every update from RBI, SEBI, Parliament and ICSI in one place, newest first. Open any title for a short brief and the official document."}</p>
</div>
<nav class="show-toggle" aria-label="Show"><span class="subjects-label">Show:</span>
  ${show.map((x) => `<a href="${x.href}"${view === x.key ? ` aria-current="page"` : ""}>${esc(x.label)} <span class="count">${x.n}</span></a>`).join("\n  ")}
</nav>
${groups.length ? groups.map((g) => `
<section class="month" aria-labelledby="m-${g.key}">
  <h2 id="m-${g.key}" class="month-head">${esc(g.label)} <span class="count">${g.items.length}</span></h2>
  ${g.items.map((it) => feedEntry(it)).join("\n")}
</section>`).join("\n") : `<div class="empty"><h2>Nothing here yet</h2><p>No updates in the latest data refresh.</p></div>`}
${view === "recent" && olderCount ? `<p class="more"><a class="btn" href="/notifications/older/">Older updates (${olderCount})</a></p>` : ""}`;
  const title = view === "older" ? "Older notifications" : provider ? `${provider.name} notifications` : "Notifications";
  return page({ title, nav: "notifications", body });
}

/** Tabs between a provider's registers, e.g. RBI → Master Directions | Notifications. */
function providerTabs(reg, items) {
  const regs = providerRegisters(reg.provider);
  if (regs.length < 2) return "";
  return `<nav class="tabs" aria-label="${esc(providerOf(reg).name)} sections">${regs
    .map((r) => `<a href="/${r.slug}/"${r === reg ? ` aria-current="page"` : ""}>${esc(r.tab)} <span class="count">${items.filter((it) => it.register === r).length}</span></a>`)
    .join("")}</nav>`;
}

// Show the most common subjects up front; the rest fold under "More subjects" so the row stays scannable.
const MAX_VISIBLE_SUBJECTS = 6;

function subjectLinks(topics) {
  const chip = (t) => `<li><a href="/topics/${t.slug}/">${esc(t.label)} <span class="count">${t.items.length}</span></a></li>`;
  const rest = topics.slice(MAX_VISIBLE_SUBJECTS);
  return `<nav class="subjects" aria-label="Subjects">
  <span class="subjects-label">Subjects:</span>
  <ul class="topic-chips">${topics.slice(0, MAX_VISIBLE_SUBJECTS).map(chip).join("")}</ul>
  ${rest.length ? `<details class="more-subjects"><summary>${rest.length} more subjects</summary><ul class="topic-chips">${rest.map(chip).join("")}</ul></details>` : ""}
</nav>`;
}

// Narrower views of RBI Notifications, each a plain page (no JavaScript).
const NOTIF_VIEWS = [
  { key: "all", path: "", label: "All", test: () => true },
  { key: "nbfc", path: "nbfc/", label: "Mentions NBFCs", test: (it) => it.nbfc },
  { key: "ours", path: "relevant/", label: "Hide other entities", test: (it) => !it.otherEntity },
];

function notifViews(reg, allItems, current) {
  if (reg.key !== "rbi-notif") return "";
  return `<nav class="show-toggle" aria-label="Show"><span class="subjects-label">Show:</span>
  ${NOTIF_VIEWS.map((v) => `<a href="/${reg.slug}/${v.path}"${v.key === current ? ` aria-current="page"` : ""}>${v.label} <span class="count">${allItems.filter(v.test).length}</span></a>`).join("\n  ")}
</nav>
<p class="muted small">${current === "ours"
    ? "Hides directions whose title addresses another type of entity, such as Commercial Banks or Payments Banks. Check the hidden list occasionally: some still affect NBFCs indirectly."
    : "“Mentions NBFCs” is a word match. An instruction can apply to NBFCs without naming them (for example sanctions lists or KYC changes for all regulated entities)."}</p>`;
}

function registerPage(reg, items, topics, { view = "all" } = {}) {
  const allItems = items.filter((it) => it.register === reg);
  const regItems = allItems.filter(NOTIF_VIEWS.find((v) => v.key === view).test);
  const provider = providerOf(reg);
  // Subjects only split a register usefully when it has more than one (today: RBI Master Directions).
  const regTopics = topics.filter((t) => !BROAD_TOPICS.has(t.label) && t.items.some((it) => it.register === reg));
  const body = `
<div class="masthead">
  <h1>${esc(provider.full)}</h1>
  ${providerTabs(reg, items)}
  <p class="lede">${esc(reg.plain)}</p>
  <p class="muted small">${allItems.length} documents${SEP}${reg.freshness === "live" ? "Checked several times a day" : "Checked monthly"}${SEP}Source: ${extLink(reg.sourceUrl, esc(host(reg.sourceUrl)))}</p>
</div>
${reg.key === "rbi-md" ? notice("pending", `<strong>Note:</strong> ${esc(COMPLIANCE_NOTE)}`) : ""}
${notifViews(reg, allItems, view)}
${regTopics.length > 1 ? subjectLinks(regTopics) : ""}
${regItems.length ? `<ol class="items">${regItems.map((it) => listItem(it)).join("\n")}</ol>` : `<div class="empty"><h2>Nothing here yet</h2><p>This list is empty in the latest data refresh.</p></div>`}`;
  return page({ title: reg.name, description: reg.desc, nav: reg.provider, body });
}

function buildTopics(items) {
  const topics = new Map();
  for (const it of items) {
    for (const t of it.topicLinks) {
      if (!topics.has(t.slug)) topics.set(t.slug, { ...t, items: [], topicKey: it.topicKey, registers: new Set() });
      const g = topics.get(t.slug);
      g.items.push(it);
      g.registers.add(it.register.name);
    }
  }
  return [...topics.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

function topicPage(t) {
  const reference = t.topicKey && PREVIEW_DATA[t.topicKey];
  const gist = t.topicKey && COMPLIANCE_GISTS[t.topicKey];
  const amd = t.topicKey && COMPLIANCE_AMENDMENTS[t.topicKey];
  const home = t.items[0].register;
  const notes = [
    reference ? `<p>${esc(reference)}</p>` : "",
    gist ? `<ul class="bullets">${gist.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "",
    amd?.changes?.length ? `<h3 class="sub">Changes noted in this subject (${esc(amd.lastUpdated)})</h3>${changeList(amd.changes)}` : "",
  ].join("");
  const body = `
${backLink(`/${home.slug}/`, home.name)}
<div class="masthead">
  <h1>${esc(t.label)}</h1>
  <p class="muted small">${t.items.length} ${t.items.length === 1 ? "document" : "documents"} from ${esc([...t.registers].join(", "))}</p>
</div>
${notes ? `<section class="panel" aria-labelledby="ref-h"><h2 id="ref-h">General notes${t.topicKey && topicName(t.topicKey) !== t.label ? ` on ${esc(topicName(t.topicKey))}` : " on this subject"}</h2>${reviewChip([t.topicKey])}${notes}</section>` : ""}
<ol class="items">${t.items.map((it) => listItem(it)).join("\n")}</ol>`;
  return page({ title: t.label, nav: home.provider, body });
}

const CHANGE_LABEL = { added: "Added", revised: "Revised", removed: "Removed" };
const CHANGE_CHIP = { added: "ok", revised: "pending", removed: "flag" };

/**
 * "Reviewed by …" mark for hand-written notes, shown only once a CS has signed them off in
 * CONTENT_REVIEWS. Unreviewed notes show nothing: they are summaries for orientation, and the
 * team always works from the official PDF.
 */
function reviewChip(keys) {
  const reviews = keys.filter(Boolean).map((k) => CONTENT_REVIEWS[k]);
  if (reviews.length && reviews.every(Boolean)) {
    const r = reviews[0];
    const on = parseCalendarDate(r.on);
    return `<span class="chip ok review" title="Checked against the official documents">Reviewed by ${esc(r.by)}${on ? `, ${fmtDate(on)}` : ""}</span>`;
  }
  return "";
}

function changeList(changes) {
  return `<ul class="changes">${changes.map((c) => `<li class="change">
    <div class="tags"><span class="chip ${CHANGE_CHIP[c.type] || "pending"}">${CHANGE_LABEL[c.type] || esc(c.type)}</span><span class="chip sev-${esc(c.severity)}">${esc(c.severity)} impact</span></div>
    <p>${esc(c.text)}${c.link ? ` ${extLink(c.link, "View Notification")}` : ""}</p>
  </li>`).join("")}</ul>`;
}

/** Opening paragraphs of a scraped summary, skipping a first paragraph that only repeats the title. */
function summaryPoints(it) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const paras = String(it.raw.summary ?? it.summaryText ?? "")
    .split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean)
    .filter((p) => norm(p) !== norm(it.raw.title || ""));
  const source = paras.length ? paras : [it.summaryText].filter(Boolean);
  return source;
}

// Subjects that only say which list a document came from; documents sharing them are not related.
const BROAD_TOPICS = new Set(["General Financial Sector", "NBFC-ICC Impact", "Capital Markets", "Corporate Law", "Board Governance", "Regulations"]);

/**
 * Everything the brief says about one document, as named sections: what changed, key points,
 * general subject notes, who it applies to, dates, subject, related documents and the official source.
 * Anything guessed says so.
 */
function docBranches(it, related) {
  const reg = it.register;
  const official = it.pdfUrl || it.link;
  const branches = [];
  const add = (key, title, leaves, { indexed = true, status = "" } = {}) =>
    leaves.length && branches.push({ key, title, leaves, indexed, status });

  if (it.changes?.length) {
    const keys = [...new Set(it.changes.map((c) => c.key))];
    add("changes", "What changed", it.changes.map((c) =>
      `<span class="chip ${CHANGE_CHIP[c.type] || "pending"}">${CHANGE_LABEL[c.type] || esc(c.type)}</span> <span class="chip sev-${esc(c.severity)}">${esc(c.severity)} impact</span> ${esc(c.text)} <span class="muted">(as of ${esc(c.lastUpdated)})</span>${c.link ? ` ${c.link === it.pdfUrl ? viewPdfLink(it) : extLink(c.link, "View Notification")}` : ""}`),
    { status: reviewChip(keys) });
  } else if (reg.key === "rbi-md") {
    const asOn = extractUpdatedDate(it.raw.title);
    add("changes", "What changed", [
      ...(it.amendedBy || []).map((n) => `Amended by <a href="${n.url}">${esc(n.title)}</a>${n.date ? `, issued ${fmtDate(n.date)}` : ""}${n.number ? ` (<span class="mono">${esc(n.number)}</span>)` : ""}.`),
      `Consolidated version${asOn ? ` updated as on ${esc(asOn)}` : ""}. The individual changes are not summarised here: ${extLink(official, "read the official document")}.`,
    ]);
  } else if (it.excerpt) {
    add("changes", "What it says", [
      ...(it.amends ? [`Amends <a href="${it.amends.url}">${esc(it.amends.title)}</a>.`] : []),...summaryPoints(it).map(esc), `<em>Opening paragraphs only.</em> ${extLink(official, "Read the full text")}`]);
  } else if (it.summaryText) {
    add("changes", "What it covers", summaryPoints(it).map(esc));
  }

  if (it.docNotes) add("points", "Key points", it.docNotes.lines.map(esc), { status: reviewChip([it.docNotes.key]) });
  if (it.topicNotes && (it.topicNotes.overview || it.topicNotes.points)) {
    add("background", `${topicName(it.topicNotes.key)}: general notes`, [
      `<em>About the subject in general, not this direction's text.</em>`,
      ...(it.topicNotes.overview ? [esc(it.topicNotes.overview)] : []),
      ...(it.topicNotes.points || []).map(esc),
    ], { status: reviewChip([it.topicNotes.key]) });
  }

  const applies = [];
  if (it.raw.applicableTo) applies.push(`Applicable to ${esc(it.raw.applicableTo)}`);
  if (it.layer) applies.push(`SBR layer: ${esc(it.layer)} <span class="muted">(auto-detected from the title, confirm in the document)</span>`);
  if (it.addressee) applies.push(`Addressed to ${esc(it.addressee)} <span class="muted">(from the title)</span>`);
  if (reg.key === "rbi-notif") applies.push(it.nbfc ? `Mentions NBFCs <span class="muted">(word match, confirm applicability)</span>` : `No mention of NBFCs found <span class="muted">(word match, may still apply)</span>`);
  if (reg.key === "ss") applies.push(esc(it.basis));
  if (reg.key === "acts" && it.raw.type) applies.push(esc(it.raw.type));
  add("applies", "Who it applies to", applies, { indexed: false });

  const dates = [it.date ? `${esc(reg.dateLabel)} ${dateHtml(it, false)}` : `${esc(reg.dateLabel)} date not stated at source`];
  const updatedAsOn = reg.key === "rbi-md" && extractUpdatedDate(it.raw.title);
  if (updatedAsOn) dates.push(`Updated as on ${esc(updatedAsOn)}`);
  if (it.raw.lastAmended) dates.push(esc(it.raw.lastAmended));
  if (it.detectedAt && fmtDateTime(it.detectedAt)) dates.push(`First seen here ${fmtDateTime(it.detectedAt)}`);
  add("dates", "Dates", dates, { indexed: false });

  add("subject", "Subject", it.topicLinks.map((t) => `<a href="/topics/${t.slug}/">${esc(t.label)}</a>`), { indexed: false });
  add("related", "Related", related.map((o) => `<a href="${o.url}">${esc(o.title)}</a>`), { indexed: false });
  add("source", "Official source", [
    ...(it.pdfUrl ? [viewPdfLink(it)] : []),
    viewSiteLink(it, `Page on ${esc(host(it.link))}`),
  ], { indexed: false });

  return branches;
}

const branchHeading = (b, tag = "h3") => `<${tag}>${esc(b.title)}</${tag}>${b.status ? `<div class="brief-status" data-pagefind-ignore>${b.status}</div>` : ""}`;
const leafList = (b, cls) => `<ul class="${cls}">${b.leaves.map((l) => `<li>${l}</li>`).join("")}</ul>`;

/** Brief view: the branches top to bottom in the order a compliance reader needs them. */
function briefView(it, branches) {
  const get = (k) => branches.find((b) => b.key === k);
  const block = (b, cls = "") => (b ? `<section class="brief-block brief-${b.key}${cls ? " " + cls : ""}"${b.indexed ? "" : " data-pagefind-ignore"}>${branchHeading(b)}${leafList(b, "brief-list")}</section>` : "");
  const foot = ["subject", "related", "source"].map(get).filter(Boolean);
  return `<div class="brief">
  ${block(get("changes"), "lead")}
  ${get("applies") || get("dates") ? `<div class="brief-pair">${block(get("applies"))}${block(get("dates"))}</div>` : ""}
  ${block(get("points"))}
  ${block(get("background"))}
  ${foot.length ? `<dl class="brief-foot" data-pagefind-ignore>${foot.map((b) => `<div><dt>${esc(b.title)}</dt><dd>${b.leaves.join(SEP)}</dd></div>`).join("")}</dl>` : ""}
</div>`;
}

function overview(it, related) {
  return `<section class="overview" aria-labelledby="overview-h" data-pagefind-body>
  <h2 id="overview-h" class="sr-only">Brief</h2>
  ${briefView(it, docBranches(it, related))}
</section>`;
}

function detailPage(it, items, fileMeta) {
  const reg = it.register;
  const specific = it.topicLinks.filter((t) => !BROAD_TOPICS.has(t.label));
  const related = items.filter((o) => o !== it && o.topicLinks.some((t) => specific.some((x) => x.slug === t.slug))).slice(0, 3);
  const officialTitle = it.raw.title.trim() !== it.title ? it.raw.title.trim() : null;

  const details = kv([
    ["Kreon ID", `<span class="mono">${esc(it.id)}</span>`],
    ["Source", `<a href="/${reg.slug}/">${esc(reg.name)}</a>`],
    ["Official number", it.number ? `<span class="mono">${esc(it.number)}</span>` : null],
    [reg.dateLabel, it.date ? dateHtml(it, false) : "Not stated at source"],
    ...(it.details || []).map(([k, v]) => [k, v ? esc(v) : null]),
    ["SBR layer", it.layer ? esc(it.layer) : null],
    ["Subject", it.topicLinks.map((t) => `<a href="/topics/${t.slug}/">${esc(t.label)}</a>`).join(", ")],
    ["Official title", officialTitle ? esc(officialTitle) : null],
    ["Official page", extLink(it.link, `<span class="url">${esc(it.link)}</span>`)],
    ["Official PDF", it.pdfUrl ? extLink(it.pdfUrl, `<span class="url">${esc(it.pdfUrl)}</span>`) : null],
    ["First detected", it.detectedAt && fmtDateTime(it.detectedAt) ? `<time datetime="${esc(it.detectedAt)}">${fmtDateTime(it.detectedAt)}</time>` : null],
    ["Last checked", it.lastCheckedAt && fmtDateTime(it.lastCheckedAt) ? `<time datetime="${esc(it.lastCheckedAt)}">${fmtDateTime(it.lastCheckedAt)}</time>` : null],
    ["Content hash", it.contentHash ? `<span class="mono hash">${esc(it.contentHash)}</span>` : null],
    ["Amendment signal", it.amendedSignal ? esc(it.amendedSignal) : null],
    ["List refreshed", fileMeta[reg.key] && fmtDateTime(fileMeta[reg.key]) ? `<time datetime="${esc(fileMeta[reg.key])}">${fmtDateTime(fileMeta[reg.key])}</time>` : null],
    ["How often checked", esc(reg.freshnessNote)],
  ]);

  const body = `
${backLink(`/${reg.slug}/`, reg.name)}
<article class="doc" data-pagefind-body>
  <div data-pagefind-ignore>${tagRow(it, { number: true })}</div>
  <h1 class="doc-title" data-pagefind-meta="title" data-topics="${esc(it.topics.join(", "))}"${it.number ? ` data-number="${esc(it.number)}"` : ""} data-pagefind-index-attrs="data-topics${it.number ? ",data-number" : ""}">${esc(it.title)}</h1>
  <p class="lede" data-pagefind-ignore>${dateHtml(it)}${SEP}${esc(reg.name)}</p>
  <div class="actions" data-pagefind-ignore>
    ${it.pdfUrl ? viewPdfLink(it, "View PDF", "btn primary") + viewSiteLink(it, "View on website", "btn") : viewSiteLink(it, `View on ${esc(host(it.link))}`, "btn primary")}
    ${it.viewUrl ? `<a class="btn" href="${esc(it.viewUrl)}" download="${esc(it.id)}.pdf">Download PDF</a>` : ""}
  </div>
  ${it.pdfUrl ? `<p class="muted small" data-pagefind-ignore>The PDF opens in your browser's viewer. To keep a copy, use the viewer's download button${it.viewUrl ? " or Download PDF" : ""}.</p>` : ""}
  ${it.notice ? `<div data-pagefind-ignore>${notice("pending", `<strong>Note:</strong> ${esc(it.notice)}`)}</div>` : ""}
</article>
${overview(it, related)}
<div class="doc">
  <details class="more-info">
    <summary>More details and sources</summary>
    ${details}
  </details>
</div>`;
  return page({ title: it.title, description: (it.summaryText || it.title).slice(0, 200), nav: reg.provider, body, progress: true });
}

function searchPage(topics) {
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const years = [];
  for (let y = todayIst.y; y >= 2022; y--) years.push(y);
  const body = `
<div class="masthead">
  <h1>Search</h1>
  <p class="lede">Type a word, a topic or a circular number.</p>
</div>
<noscript>${notice("flag", "<strong>Search needs JavaScript.</strong> You can still open RBI, SEBI, Acts &amp; Rules or Standards from the menu.")}</noscript>
<form class="search-form" id="search-form" action="/search/" method="get" role="search">
  <div class="search-main">
    <div class="field q">
      <label for="q">Search for</label>
      <input id="q" name="q" type="search" autocomplete="off" placeholder="e.g. KYC, priority sector, RBI/2026-27/256">
    </div>
    <div class="field"><label for="type">In</label><select id="type" name="type">${opt("", "Everything")}${REGISTERS.map((r) => opt(r.key, r.name)).join("")}</select></div>
    <button class="btn primary" type="submit">Search</button>
  </div>
  <details class="more-filters" id="more-filters">
    <summary>More filters</summary>
    <div class="field-row">
      <div class="field"><label for="year">Year</label><select id="year" name="year">${opt("", "All years")}${years.map((y) => opt(y, y)).join("")}</select></div>
      <div class="field"><label for="month">Month</label><select id="month" name="month">${opt("", "All months")}${MON.map((m, i) => opt(i + 1, m)).join("")}</select></div>
      <div class="field"><label for="from">From</label><input id="from" name="from" type="date"></div>
      <div class="field"><label for="to">To</label><input id="to" name="to" type="date"></div>
    </div>
    <fieldset class="subject-pick">
      <legend>Subject</legend>
      <div class="pills">
        <label class="pill"><input type="radio" name="topic" value="" checked> All subjects</label>
        ${topics.map((t) => `<label class="pill"><input type="radio" name="topic" value="${esc(t.slug)}"> ${esc(t.label)}</label>`).join("\n        ")}
      </div>
    </fieldset>
    <div class="field-row checks">
      <label class="check"><input type="checkbox" name="recent" value="90" id="recent"> Last 90 days only</label>
      <label class="check"><input type="checkbox" name="nbfc" value="1" id="nbfc"> NBFC-relevant only</label>
    </div>
  </details>
</form>
<div class="results-bar">
  <p id="status" class="status" role="status" aria-live="polite"></p>
  <div class="results-actions"><a class="btn" href="/search/" id="clear">Clear</a><button class="btn" type="button" id="export" hidden>Export CSV</button></div>
</div>
<ol id="results" class="items"></ol>`;
  return page({
    title: "Search", nav: "search", body,
    scripts: `<script type="module" src="/assets/search.js"></script>\n`,
  });
}

function aboutPage(items) {
  const h = (id, text) => `<h2 id="${id}"><a class="anchor" href="#${id}">${esc(text)}</a></h2>`;
  const body = `
<div class="masthead">
  <h1>How it works</h1>
  <p class="lede">Kreon RegPulse collects compliance updates from RBI, SEBI, Parliament and ICSI in one place, so you don't have to check each website.</p>
</div>
<div class="prose">
${h("use", "Using this site")}
<ol class="steps">
  <li><strong>See what's new.</strong> <a href="/notifications/">Notifications</a> lists every update from RBI, SEBI, Parliament and ICSI, newest first.</li>
  <li><strong>Open a document.</strong> Click any update for a short brief (what changed, who it applies to, dates and key points) and a button to the official PDF.</li>
  <li><strong>Find something specific.</strong> Open RBI, SEBI, Acts &amp; Rules or Standards from the menu, or type in the search box at the top of every page (a word, a subject or a circular number).</li>
</ol>

${h("sources", "Where the information comes from")}
<dl class="kv">
${REGISTERS.map((r) => `<div><dt><a href="/${r.slug}/">${esc(r.name)}</a></dt><dd>${esc(r.desc)} ${extLink(r.sourceUrl, esc(host(r.sourceUrl)))}</dd></div>`).join("\n")}
</dl>

${h("freshness", "How often it's checked")}
<ul class="bullets">
<li><strong>RBI and SEBI</strong>: ${esc(FRESHNESS_COPY.live)}.</li>
<li><strong>Acts &amp; Rules</strong>: ${esc(FRESHNESS_COPY.actsMonthly)}.</li>
<li><strong>Secretarial Standards</strong>: ${esc(FRESHNESS_COPY.ssMonthly)}.</li>
</ul>
<p>Titles, dates, numbers, links and the opening paragraphs of each notification are collected automatically from the official websites. Treat each one as a pointer to the official document, not a substitute for it.</p>

${h("verification", "Summaries and the official text")}
<p>Key points, change notes and general notes on a subject are short summaries written by the Kreon team to help you see what an update is about. Always work from the official PDF. A note marked <span class="chip ok">Reviewed by …</span> has been checked by a named CS against the official documents.</p>
<p>Change notes appear only on the document they are about. General notes on a subject (for example "Capital Adequacy") are labelled as such and are never presented as a direction's own text.</p>

${h("labels", "What the labels mean")}
<dl class="kv">
<div><dt><span class="chip ok">New</span></dt><dd>Issued or amended in the last ${RECENTLY_UPDATED_WINDOW_DAYS} days.</dd></div>
<div><dt><span class="chip accent">Mentions NBFCs</span></dt><dd>An RBI notification whose title or summary mentions NBFCs, non-banking financial companies or housing finance. It is a word match: an instruction can apply to NBFCs without naming them.</dd></div>
<div><dt><span class="chip">For Commercial Banks</span></dt><dd>RBI addressed this direction to another type of entity, as stated in its title. "Hide other entities" on RBI Notifications leaves these out.</dd></div>
<div><dt><span class="chip flag">⚑ Duplicate title at source</span></dt><dd>A problem in the official listing itself, such as two entries with the same title or no date. Open the official PDF to confirm what the document is.</dd></div>
<div><dt>SBR layer (auto-detected)</dt><dd>The likely Scale-Based Regulation layer for an RBI Master Direction, guessed from words in its title. ${esc(COMPLIANCE_NOTE)}</dd></div>
</dl>

${h("glossary", "Glossary")}
<dl class="kv glossary">
<div><dt>Master Direction</dt><dd>RBI's consolidated rulebook on one subject (for example KYC). RBI updates it as new instructions are issued; the title shows "Updated as on" the latest date.</dd></div>
<div><dt>Notification / Circular</dt><dd>A single instruction from RBI or SEBI. It may change a Master Direction or a regulation, or stand on its own.</dd></div>
<div><dt>Regulations (SEBI)</dt><dd>SEBI's rulebooks made under the SEBI Act, such as LODR (listing obligations), PIT (insider trading), SAST (takeovers) and ICDR (issue of capital).</dd></div>
<div><dt>NBFC-ICC</dt><dd>Non-Banking Financial Company – Investment and Credit Company: the main category of NBFCs that lend and invest.</dd></div>
<div><dt>SBR</dt><dd>Scale-Based Regulation: RBI's framework that places NBFCs in a Base, Middle, Upper or Top layer by size and risk. Stricter rules apply to higher layers.</dd></div>
<div><dt>CRAR</dt><dd>Capital to Risk-weighted Assets Ratio: capital held as a share of the lender's risk-weighted assets.</dd></div>
<div><dt>NPA</dt><dd>Non-Performing Asset: a loan on which payment has been overdue for more than 90 days.</dd></div>
<div><dt>KYC / AML</dt><dd>Know Your Customer and Anti-Money Laundering: rules for identifying customers and reporting suspicious transactions.</dd></div>
<div><dt>Secretarial Standards</dt><dd>ICSI's standards for board meetings (SS-1), general meetings (SS-2) and other company secretarial practice. SS-1 and SS-2 are mandatory under Section 118(10) of the Companies Act, 2013.</dd></div>
</dl>

${h("dates", "Dates")}
<p>Dates are shown as DD MMM YYYY in Indian Standard Time (IST). The date is the issue date for directions, notifications and circulars, the last-amended date for SEBI Regulations, the enactment date for Acts &amp; Rules and the effective date for Secretarial Standards.</p>

${h("disclaimer", "Disclaimer")}
<p><strong>Informational only, not legal advice.</strong> ${esc(NOT_AFFILIATED)} Always verify against the official source before acting on it. PDFs open in your browser&#39;s viewer straight from the regulator&#39;s website; use the viewer&#39;s download button to keep a copy. The one exception is ICSI, whose website only offers downloads: its Secretarial Standards PDFs are copied unchanged when the site is built so they can be viewed, and each page also links to ICSI&#39;s original.</p>
</div>`;
  return page({ title: "How it works", nav: "about", body });
}

function notFoundPage() {
  const body = `
<div class="masthead">
  <h1>Page not found</h1>
  <p class="lede">This page doesn't exist, or the document is no longer listed at source.</p>
</div>
<p class="actions"><a class="btn primary" href="/">RBI</a><a class="btn" href="/notifications/">Notifications</a><a class="btn" href="/sebi/">SEBI</a><a class="btn" href="/search/">Search</a></p>`;
  return page({ title: "Page not found", nav: "", body });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function write(rel, content) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

// PDF hosts that send "Content-Disposition: attachment", so their PDFs can only be downloaded,
// never viewed, from the original link. Their PDFs are copied into the site at build time.
const FORCED_DOWNLOAD_HOSTS = new Set(["icsis3-console.icsi.edu"]);

/** Copy force-download PDFs into dist/files/ so "View PDF" opens them in the browser. */
async function copyForViewing(items) {
  for (const it of items) {
    if (!it.pdfUrl || !FORCED_DOWNLOAD_HOSTS.has(host(it.pdfUrl))) continue;
    try {
      const res = await fetch(it.pdfUrl, {
        signal: AbortSignal.timeout(60000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      const pdf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || pdf.subarray(0, 4).toString() !== "%PDF") throw new Error(`HTTP ${res.status}, not a PDF`);
      // Slugified like page URLs, so an id from source data can't point outside dist/.
      const name = `${slugify(it.id)}.pdf`;
      await write(`files/${name}`, pdf);
      it.viewUrl = `/files/${name}`;
    } catch (err) {
      console.warn(`⚠ Couldn't copy ${it.pdfUrl} for viewing (${err.message}); linking to the original, which downloads.`);
    }
  }
}

async function main() {
  const { items, fileMeta } = await loadAll();
  LAST_CHECKED = Object.values(fileMeta).filter(Boolean).sort().pop() || null;

  await fs.rm(OUT, { recursive: true, force: true });

  const fontDir = path.join(ROOT, "node_modules/@fontsource-variable/literata/files");
  for (const f of ["literata-latin-wght-normal.woff2", "literata-latin-ext-wght-normal.woff2"]) {
    await fs.mkdir(path.join(OUT, "assets/fonts"), { recursive: true });
    await fs.copyFile(path.join(fontDir, f), path.join(OUT, "assets/fonts", f));
  }
  await fs.copyFile(path.join(ROOT, "site/styles.css"), path.join(OUT, "assets/styles.css"));
  await fs.copyFile(path.join(ROOT, "site/search.js"), path.join(OUT, "assets/search.js"));
  await fs.copyFile(path.join(ROOT, "kreon-logo.png"), path.join(OUT, "assets/kreon-logo.png"));

  await copyForViewing(items);
  const topics = buildTopics(items);

  await write("index.html", registerPage(REGISTERS.find((r) => r.key === LANDING_REGISTER), items, topics));
  await write("notifications/index.html", notificationsPage(items, "recent"));
  await write("notifications/older/index.html", notificationsPage(items, "older"));
  for (const p of PROVIDERS) await write(`notifications/${p.key}/index.html`, notificationsPage(items, p.key));
  for (const reg of REGISTERS) await write(`${reg.slug}/index.html`, registerPage(reg, items, topics));
  const notif = REGISTERS.find((r) => r.key === "rbi-notif");
  for (const v of NOTIF_VIEWS.filter((x) => x.path)) await write(`${notif.slug}/${v.path}index.html`, registerPage(notif, items, topics, { view: v.key }));
  await write("robots.txt", "User-agent: *\nDisallow: /\n");
  for (const t of topics) await write(`topics/${t.slug}/index.html`, topicPage(t));
  for (const it of items) await write(`${it.url.slice(1)}index.html`, detailPage(it, items, fileMeta));
  await write("search/index.html", searchPage(topics));
  await write("about/index.html", aboutPage(items));
  await write("404.html", notFoundPage());

  // Compact item list for the search page's filters and CSV export.
  await write("search/items.json", JSON.stringify(items.map((it) => ({
    url: it.url,
    title: it.title,
    type: it.register.key,
    register: it.register.name,
    badge: it.register.badge,
    color: it.register.color,
    dateLabel: it.register.dateLabel,
    date: it.date ? isoDate(it.date) : null,
    dateText: it.date ? fmtDate(it.date) : null,
    number: it.number || null,
    topics: it.topicLinks,
    nbfc: !!it.nbfc,
    recent: it.recent,
    flags: it.flags || [],
    addressee: it.otherEntity ? it.addressee : null,
    link: it.link,
    pdf: it.pdfUrl,
    view: it.viewUrl || it.pdfUrl,
    text: (it.summaryText || "").slice(0, 400),
  }))));

  console.log(`✔ Built ${items.length} entries, ${topics.length} topics → ${path.relative(ROOT, OUT)}/${IS_TEST ? " (TEST BUILD)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
