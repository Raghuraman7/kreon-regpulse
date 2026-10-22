// Search page: the only page that ships JavaScript.
// Full-text matching comes from Pagefind's static index; filters and CSV export run
// over /search/items.json. All state lives in the URL (?q=&type=&topic=&year=&month=&from=&to=&recent=&nbfc=),
// so results can be bookmarked or shared. Results update as you type or change a filter;
// without JavaScript the form still submits as a plain GET.

const MAX_EXCERPTS = 60;
const TYPING_DELAY_MS = 220;
const LOAD_TIMEOUT_MS = 15000;

const form = document.getElementById("search-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const exportBtn = document.getElementById("export");

const params = new URLSearchParams(location.search);
const state = {
  q: (params.get("q") || "").trim(),
  type: params.get("type") || "",
  topic: params.get("topic") || "",
  year: params.get("year") || "",
  month: params.get("month") || "",
  from: params.get("from") || "",
  to: params.get("to") || "",
  recent: params.get("recent") === "90",
  nbfc: params.get("nbfc") === "1",
};

let current = [];

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

function extLink(url, label) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Official source: ${esc(host(url))} (opens in a new tab)">${label}<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
}

const normaliseUrl = (url) => url.replace(/index\.html$/, "").replace(/\.html$/, "/");

function fillForm() {
  form.q.value = state.q;
  form.type.value = state.type;
  // Subjects are radio buttons rendered at build time (a long <select> popup can open under
  // the pointer and pick a random subject on a quick click).
  form.topic.value = state.topic;
  form.year.value = state.year;
  form.month.value = state.month;
  form.from.value = state.from;
  form.to.value = state.to;
  form.recent.checked = state.recent;
  form.nbfc.checked = state.nbfc;
}

/**
 * Drop filter values from the URL that the form can't show (an old bookmark, a typo), so a
 * filter is never applied invisibly. The form already refuses them: a <select> or radio
 * group set to an unknown value selects nothing, and a date input clears an invalid date.
 * Call after fillForm(). Returns a note naming what was ignored or corrected.
 */
function reconcileState() {
  const ignored = [];
  let note = "";
  if (/^0?[1-9]$|^1[0-2]$/.test(state.month)) state.month = String(Number(state.month));
  form.month.value = state.month;
  for (const [key, label] of [["type", "source"], ["topic", "subject"], ["year", "year"], ["month", "month"], ["from", "from date"], ["to", "to date"]]) {
    if (state[key] && form[key].value !== state[key]) {
      ignored.push(`unknown ${label} “${state[key]}”`);
      state[key] = "";
    }
  }
  if (state.from && state.to && state.from > state.to) {
    [state.from, state.to] = [state.to, state.from];
    form.from.value = state.from;
    form.to.value = state.to;
    note += " From and to dates were swapped.";
  }
  if (ignored.length) note += ` Ignored ${ignored.join(", ")}.`;
  // Keep "More filters" open when one of its filters is in use, so it is never applied invisibly.
  if (state.topic || state.year || state.month || state.from || state.to || state.recent || state.nbfc) {
    document.getElementById("more-filters").open = true;
  }
  return note;
}

function passesFilters(it) {
  if (state.type && it.type !== state.type) return false;
  if (state.topic && !it.topics.some((t) => t.slug === state.topic)) return false;
  const dateFiltered = state.year || state.month || state.from || state.to || state.recent;
  if (!it.date) return !dateFiltered;
  const [y, m] = it.date.split("-");
  if (state.year && y !== state.year) return false;
  if (state.month && Number(m) !== Number(state.month)) return false;
  if (state.from && it.date < state.from) return false;
  if (state.to && it.date > state.to) return false;
  if (state.recent) {
    const days = (Date.now() - Date.parse(it.date + "T00:00:00+05:30")) / 86400000;
    if (days < 0 || days > 90) return false;
  }
  if (state.nbfc && !it.nbfc) return false;
  return true;
}

async function pagefindMatches(q) {
  const pagefind = await import("/pagefind/pagefind.js");
  const search = await pagefind.search(q);
  // The registers hold a few hundred entries at most, so loading every match is cheap.
  // Results keep Pagefind's ranking; only the first MAX_EXCERPTS show an excerpt.
  // For a word it doesn't know, Pagefind falls back to ever-shorter prefixes, so "aaaa"
  // matches every page containing "a". Keep only pages containing each word's first
  // four letters (short enough to still allow "lending" → "lend").
  const stems = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.slice(0, 4));
  const data = (await Promise.all(search.results.map((r) => r.data())))
    .filter((d) => { const text = d.content.toLowerCase(); return stems.every((st) => text.includes(st)); });
  const urls = data.map((d) => normaliseUrl(d.url));
  const excerpts = new Map(data.slice(0, MAX_EXCERPTS).map((d, i) => [urls[i], d.excerpt]));
  return { urls, excerpts };
}

function substringMatches(items, q) {
  const needle = q.toLowerCase();
  return items.filter((it) =>
    [it.title, it.number, it.text, it.register, ...it.topics.map((t) => t.label)].join(" ").toLowerCase().includes(needle));
}

// Same markup as listItem() in site/build.mjs.
function renderItem(it, excerpt) {
  const tags = [`<span class="badge t-${esc(it.color)}">${esc(it.badge)}</span>`];
  for (const f of it.flags) tags.push(`<span class="chip flag" title="${esc(f.why)}">⚑ ${esc(f.label)}</span>`);
  if (it.recent) tags.push(`<span class="chip ok" title="Issued or amended in the last 14 days">New</span>`);
  if (it.nbfc) tags.push(`<span class="chip accent" title="The title or summary mentions NBFCs, non-banking financial companies or housing finance (word match)">Mentions NBFCs</span>`);
  if (it.addressee) tags.push(`<span class="chip" title="RBI addressed this to ${esc(it.addressee)}, per its title. Check before setting it aside.">For ${esc(it.addressee)}</span>`);
  const date = it.date
    ? `${esc(it.dateLabel)} <time datetime="${esc(it.date)}">${esc(it.dateText)}</time>`
    : `${esc(it.dateLabel)} date not stated at source`;
  // Same as viewPdfLink()/viewSiteLink() in site/build.mjs: PDFs open in the browser's viewer.
  const official = it.pdf
    ? `<a href="${esc(it.view || it.pdf)}" target="_blank" rel="noopener noreferrer" title="Opens the official PDF from ${esc(host(it.pdf))} in your browser's viewer; use its download button to save a copy">View PDF<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span></a>`
    : extLink(it.link, `View on ${esc(host(it.link))}`);
  return `<li class="item">
  <div class="tags">${tags.join("")}</div>
  <h2 class="item-title"><a href="${esc(it.url)}">${esc(it.title)}</a></h2>
  ${excerpt ? `<p class="excerpt">${excerpt}</p>` : ""}
  <p class="evidence">${date}<span class="sep" aria-hidden="true"> · </span>${official}</p>
</li>`;
}

function describeFilters(topics) {
  const parts = [];
  if (state.type) parts.push(form.type.selectedOptions[0]?.textContent);
  if (state.topic) parts.push(topics.find((t) => t.slug === state.topic)?.label);
  if (state.year) parts.push(state.year);
  if (state.month) parts.push(form.month.selectedOptions[0]?.textContent);
  if (state.from || state.to) parts.push(`${state.from || "…"} → ${state.to || "…"}`);
  if (state.recent) parts.push("last 90 days");
  if (state.nbfc) parts.push("NBFC-relevant");
  return parts.filter(Boolean).join(", ");
}

function exportCsv() {
  const rows = [
    ["Title", "Date", "Source", "Link", "PDF URL"],
    ...current.map((it) => [it.title, it.date, it.register, it.link || "", it.pdf || ""]),
  ];
  // A leading = + - @ (or tab/CR) makes Excel treat a cell as a formula; titles are scraped
  // from outside sites, so prefix those with an apostrophe.
  const cell = (v) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  };
  // The BOM tells Excel the file is UTF-8, so "–" and "’" in titles don't come out garbled.
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = `kreon-regpulse-${state.type || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** state from the form's current values (always valid: the form only offers real options). */
function readForm() {
  state.q = form.q.value.trim();
  state.type = form.type.value;
  state.topic = form.topic.value;
  state.year = form.year.value;
  state.month = form.month.value;
  state.from = form.from.value;
  state.to = form.to.value;
  state.recent = form.recent.checked;
  state.nbfc = form.nbfc.checked;
}

/** Mirror state into the address bar, so the current results can be bookmarked or shared. */
function syncUrl() {
  const next = new URLSearchParams();
  for (const key of ["q", "type", "topic", "year", "month", "from", "to"]) if (state[key]) next.set(key, state[key]);
  if (state.recent) next.set("recent", "90");
  if (state.nbfc) next.set("nbfc", "1");
  const qs = next.toString();
  // replaceState, not pushState: Back should leave the search page, not replay keystrokes.
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

const SKELETON = Array.from({ length: 6 }, () =>
  `<li class="skeleton" aria-hidden="true"><span class="skeleton-line short"></span><span class="skeleton-line long"></span><span class="skeleton-line mid"></span></li>`).join("");

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, AbortSignal.timeout ? { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) } : {});
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastError;
}

let items = null;
let byUrl = new Map();
let topics = [];
let pagefindBroken = false;
let runId = 0;

async function update(note = "") {
  const id = ++runId;
  resultsEl.setAttribute("aria-busy", "true");
  let matched = items;
  let excerpts = new Map();
  if (state.q) {
    if (!pagefindBroken) {
      try {
        const res = await pagefindMatches(state.q);
        matched = res.urls.map((u) => byUrl.get(u)).filter(Boolean);
        excerpts = res.excerpts;
      } catch (err) {
        console.warn("Pagefind unavailable, falling back to title matching", err);
        pagefindBroken = true;
      }
    }
    if (pagefindBroken) {
      matched = substringMatches(items, state.q);
      note += " Full-text index unavailable; matched titles and summaries only.";
    }
  }
  // A newer search started while this one waited on Pagefind; let that one render.
  if (id !== runId) return;

  current = matched.filter(passesFilters);
  const filters = describeFilters(topics);
  const count = `${current.length} ${current.length === 1 ? "document" : "documents"}`;
  statusEl.textContent = state.q
    ? `${count} for “${state.q}”${filters ? ` · ${filters}` : ""}.${note}`
    : `${count}${filters ? ` · ${filters}` : ", newest first"}.${note}`;

  resultsEl.innerHTML = current.length
    ? current.map((it) => renderItem(it, excerpts.get(it.url))).join("")
    : `<li class="empty"><h2>Nothing found</h2><p>Try a different keyword or <a href="/search/" data-clear>clear the filters</a>.</p></li>`;
  resultsEl.setAttribute("aria-busy", "false");
  exportBtn.hidden = current.length === 0;
}

function showLoadError(err) {
  console.error(err);
  const offline = navigator.onLine === false;
  statusEl.textContent = offline ? "You're offline." : "Search couldn't load.";
  resultsEl.setAttribute("aria-busy", "false");
  resultsEl.innerHTML = `<li class="search-error"><div class="notice flag" role="alert">
  <p><strong>${offline ? "No internet connection." : "The document list didn't load."}</strong> ${offline ? "Search will retry as soon as you're back online." : "This is usually a brief network problem."} You can still browse RBI, SEBI, Acts &amp; Rules and Standards from the menu.</p>
  <button class="btn" type="button" data-retry>Try again</button>
</div></li>`;
  exportBtn.hidden = true;
}

async function init() {
  statusEl.textContent = "Loading documents…";
  resultsEl.setAttribute("aria-busy", "true");
  resultsEl.innerHTML = SKELETON;
  try {
    const list = await fetchJson("/search/items.json");
    if (!Array.isArray(list)) throw new Error("items.json is not a list");
    items = list;
  } catch (err) {
    showLoadError(err);
    return;
  }
  byUrl = new Map(items.map((it) => [it.url, it]));
  topics = [...new Map(items.flatMap((it) => it.topics).map((t) => [t.slug, t])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  // Pick up anything typed while the list was loading.
  const typedWhileLoading = form.q.value.trim() !== state.q;
  readForm();
  if (typedWhileLoading) syncUrl();
  await update(urlNote);
}

function onFormChange() {
  readForm();
  syncUrl();
  if (!items) return; // init() reads the form once the list arrives
  update(state.from && state.to && state.from > state.to ? " “From” is after “To”, so nothing can match; swap the dates." : "");
}

// Wide screens have room to show every filter up front; on phones they stay folded so
// results aren't pushed far down.
const filtersOpenByDefault = matchMedia("(min-width: 900px)").matches;
document.getElementById("more-filters").open ||= filtersOpenByDefault;

// Fill the form from the URL straight away, so it never flashes empty while the list loads.
fillForm();
const urlNote = reconcileState();
// Arriving from the header's search icon: be ready to type.
if (!state.q) form.q.focus({ preventScroll: true });

let typingTimer;
form.addEventListener("input", (e) => {
  if (e.target !== form.q) return;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(onFormChange, TYPING_DELAY_MS);
});
form.addEventListener("change", (e) => {
  if (e.target !== form.q) onFormChange();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(typingTimer);
  onFormChange();
});
// Warm up the full-text index while the user starts typing.
form.q.addEventListener("focus", () => { import("/pagefind/pagefind.js").catch(() => {}); }, { once: true });

function clearAll(e) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // let "open in new tab" work
  e.preventDefault();
  form.reset();
  document.getElementById("more-filters").open = filtersOpenByDefault;
  onFormChange();
  form.q.focus();
}
document.getElementById("clear").addEventListener("click", clearAll);
resultsEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-clear]")) clearAll(e);
  if (e.target.closest("[data-retry]")) init();
});
window.addEventListener("online", () => {
  pagefindBroken = false;
  if (!items) init();
});
// "/" jumps to the search box, as on most search pages.
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, select, textarea, [contenteditable]")) return;
  e.preventDefault();
  form.q.focus();
  form.q.select();
});

exportBtn.addEventListener("click", () => {
  try {
    exportCsv();
  } catch (err) {
    console.error(err);
    statusEl.textContent += " Couldn't create the CSV file; try again.";
  }
});

init();
