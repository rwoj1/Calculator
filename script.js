"use strict";

/* ====================== Helpers ====================== */

const $ = (id) => document.getElementById(id);
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clamp   = (n, a, b) => Math.max(a, Math.min(b, n));
const roundTo = (x, step) => Math.round(x / step) * step;
const floorTo = (x, step) => Math.floor(x / step) * step;
const ceilTo  = (x, step) => Math.ceil (x / step) * step;
const MAX_WEEKS = 60;
const THREE_MONTHS_MS = 90 * 24 * 3600 * 1000;
const EPS = 1e-6;

/* ===== Patch interval safety (Fentanyl: ×3 days, Buprenorphine: ×7 days) ===== */
function patchIntervalRule(){
  const form = document.getElementById("formSelect")?.value || "";
  if (!/Patch/i.test(form)) return null;
  const med = document.getElementById("medicineSelect")?.value || "";
  if (/Fentanyl/i.test(med)) return 3;
  if (/Buprenorphine/i.test(med)) return 7;
  return null;
}
// Snap an <input type="number"> UP to the nearest valid multiple (bounded by the rule)
function snapIntervalToRule(input, rule){
  if (!input) return;
  const v = parseInt(input.value, 10);
  if (!Number.isFinite(v)) return;
  const snapped = Math.max(rule, Math.ceil(v / rule) * rule);
  if (snapped !== v) input.value = snapped;
}

// Apply step/min and static hint text for patch intervals
function applyPatchIntervalAttributes(){
  const rule = patchIntervalRule();          // 3 (Fentanyl) / 7 (Buprenorphine) / null
  const p1 = document.getElementById("p1Interval");
  const p2 = document.getElementById("p2Interval");
  const [h1, h2] = ensureIntervalHints();    // creates hint <div>s if missing

  // If not a patch, clear constraints + hints
  if (!rule){
    if (h1) h1.textContent = "";
    if (h2) h2.textContent = "";
    [p1,p2].forEach(inp=>{
      if (!inp) return;
      inp.removeAttribute("min");
      inp.removeAttribute("step");
      inp.classList.remove("invalid");
    });
    return;
  }

  // Static text (always the same)
  const msg = (rule === 3)
    ? "For Fentanyl patches, the interval must be a multiple of 3 days."
    : "For Buprenorphine patches, the interval must be a multiple of 7 days.";
  if (h1) h1.textContent = msg;
  if (h2) h2.textContent = msg;

  // Enforce via attributes + snap UP now
  [p1,p2].forEach(inp=>{
    if (!inp) return;
    inp.min = rule;
    inp.step = rule;
    if (inp.value) snapIntervalToRule(inp, rule);

 // NEW: snap only on "change" so multi-digit typing works
if (!inp._patchSnapAttached){
  inp.addEventListener("change", () => {
    const r = patchIntervalRule();
    if (r) snapIntervalToRule(inp, r);       // snap UP on blur/enter
    validatePatchIntervals(false);           // keep red/ok state in sync
    setGenerateEnabled();
  });
  inp._patchSnapAttached = true;
}
  });
}
// Remove duplicated labels from footer spans (leave the strong labels in HTML)
function normalizeFooterSpans(){
  const exp = document.getElementById("expBenefits");
  const wd  = document.getElementById("withdrawalInfo");
  if (exp) exp.textContent = (exp.textContent || "").replace(/^Expected\s*benefits:\s*/i, "");
  if (wd)  wd.textContent  = (wd.textContent  || "").replace(/^Withdrawal:\s*/i, "");
}
// ensure the hint <div>s exist under the inputs; returns [h1, h2]
function ensureIntervalHints(){
  const mk = (id, inputId) => {
    let el = document.getElementById(id);
    if (!el) {
      const input = document.getElementById(inputId);
      // append the hint to the same <label> as the input
      const host = input?.parentElement || input?.closest("label") || input?.parentNode;
      el = document.createElement("div");
      el.id = id;
      el.className = "hint";
      el.style.marginTop = "4px";
      host?.appendChild(el);
    }
    return el;
  };
  return [mk("p1IntHint","p1Interval"), mk("p2IntHint","p2Interval")];
}
// --- PRINT DECORATIONS (header, colgroup, zebra fallback, nowrap units) ---

function getPrintTableAndType() {
  const std = document.querySelector("#scheduleBlock table");
  if (std) return { table: std, type: "standard" };
  const pat = document.querySelector("#patchBlock table");
  if (pat) return { table: pat, type: "patch" };
  return { table: null, type: null };
}
// 1) Inject print-only header (Medicine, special instruction, disclaimer)
// De-duped print header: Medicine + special instruction + disclaimer
function injectPrintHeader() {
  const card = document.getElementById("outputCard");
  if (!card) return () => {};

  // Remove ANY previous injected header(s) to avoid duplicates
  card.querySelectorAll("#printHeaderBlock, .print-header").forEach(el => el.remove());

  const header = document.createElement("div");
  header.id = "printHeaderBlock";
  header.className = "print-only print-header";

  const medText = (document.getElementById("hdrMedicine")?.textContent || "")
    .replace(/^Medicine:\s*/i, ""); // strip the label in print
  const special = document.getElementById("hdrSpecial")?.textContent || "";

  const elMed  = document.createElement("div");
  const elSpec = document.createElement("div");
  const elDisc = document.createElement("div");

  elMed.className  = "print-medline";
  elSpec.className = "print-instruction";
  elDisc.className = "print-disclaimer";

  elMed.textContent  = medText || "";   // e.g. "Morphine SR Tablet"
  elSpec.textContent = special || "";   // e.g. "Swallow whole…"
  elDisc.textContent = "This is a guide only – always follow the advice of your healthcare professional.";

  header.append(elMed, elSpec, elDisc);
  card.prepend(header);

  return () => header.remove();
}

// 2) Add <colgroup> with sane proportions for print only
function injectPrintColgroup(table, type) {
  if (!table) return () => {};
  // Remove any prior colgroup we injected
  table.querySelector("colgroup.print-colgroup")?.remove();

  const cg = document.createElement("colgroup");
  cg.className = "print-colgroup";
  const addCol = (w) => { const c = document.createElement("col"); c.style.width = w; cg.appendChild(c); };

  if (type === "standard") {
    // Date | Strength | Instructions | M | Mi | D | N  -> totals 100%
    ["18%", "28%", "42%", "3%", "3%", "3%", "3%"].forEach(addCol);
  } else {
    // Patches: Apply | Remove | Strength(s) | Instructions
    ["18%", "18%", "34%", "30%"].forEach(addCol);
  }

  table.insertBefore(cg, table.firstElementChild);
  return () => cg.remove();
}

// 3) Zebra fallback: tag each row with its step index (survives tbody splits)
function tagRowsWithStepIndex() {
  const bodies = document.querySelectorAll("#outputCard tbody.step-group");
  const changed = [];
  bodies.forEach((tb, i) => {
    tb.querySelectorAll("tr").forEach(tr => {
      if (!tr.hasAttribute("data-step")) { tr.setAttribute("data-step", String(i)); changed.push(tr); }
    });
  });
  // cleanup returns a remover
  return () => changed.forEach(tr => tr.removeAttribute("data-step"));
}

// 4) Strength whitespace: add non-breaking joins for units (print-only)
function tightenStrengthUnits() {
  const cells = document.querySelectorAll("#outputCard td:nth-child(2)"); // Strength column
  const originals = new Map();
  const nbsp = "\u00A0";

  const fix = (s) => {
    if (!s) return s;
    // Common unit pairs: "30 mg", "12 mcg/hr", "SR tablet", "CR tablet", "Patch", "Capsule"
    return s
      .replace(/(\d+(\.\d+)?)\s*mg\b/g,        (_,n)=> n+nbsp+"mg")
      .replace(/(\d+(\.\d+)?)\s*mcg\/hr\b/g,   (_,n)=> n+nbsp+"mcg/hr")
      .replace(/\bSR\s+tablet\b/i,             "SR"+nbsp+"tablet")
      .replace(/\bCR\s+tablet\b/i,             "CR"+nbsp+"tablet")
      .replace(/\bIR\s+tablet\b/i,             "IR"+nbsp+"tablet")
      .replace(/\bSR\s+capsule\b/i,            "SR"+nbsp+"capsule")
      .replace(/\bCR\s+capsule\b/i,            "CR"+nbsp+"capsule")
      .replace(/\bPatch\b/i,                   "Patch"); // label already tight
  };

  cells.forEach(td => {
    const key = td;
    originals.set(key, td.textContent || "");
    td.textContent = fix(td.textContent || "");
  });
  return () => { originals.forEach((val, td) => { td.textContent = val; }); };
}

// 5) Add short weekday to the Date cell (print only), without bolding
function addWeekdayToDates() {
  const dateCells = document.querySelectorAll("#outputCard tbody.step-group tr:first-child td:first-child");
  const originals = new Map();
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const parseDMY = (s) => {
    // expects DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [_, d, mo, y] = m.map(Number);
    return new Date(y, mo - 1, d);
  };
  dateCells.forEach(td => {
    const orig = td.textContent || "";
    originals.set(td, orig);
    const dt = parseDMY(orig.trim());
    if (dt) td.textContent = `${weekday[dt.getDay()]} ${orig}`;
  });
  return () => { originals.forEach((val, td) => { td.textContent = val; }); };
}

// Prepare all print-only decorations and return a cleanup function
function preparePrintDecorations() {
  const { table, type } = getPrintTableAndType();
  const cleanups = [];
  cleanups.push(injectPrintHeader());
  if (table) cleanups.push(injectPrintColgroup(table, type || "standard"));
  cleanups.push(tagRowsWithStepIndex());
  cleanups.push(tightenStrengthUnits());
  cleanups.push(addWeekdayToDates());
  return () => cleanups.forEach(fn => { try { fn(); } catch {} });
}
function injectPrintDisclaimer() {
  const card = document.getElementById("outputCard");
  if (!card) return () => {};

  // If it already exists, reuse it
  let d = document.getElementById("printDisclaimer");
  if (!d) {
    d = document.createElement("div");
    d.id = "printDisclaimer";
    d.className = "print-disclaimer";
    d.textContent = "This is a guide only – always follow the advice of your healthcare professional.";
    card.prepend(d);
  }
  // Return a cleanup fn so we can remove after print if you prefer
  return () => {
    // keep disclaimer visible on screen too? remove if you want it print-only:
    // d.remove();
  };
}


// validate intervals, show hints, toggle input error class, and optionally toast
function validatePatchIntervals(showToastToo=false){
  const rule = patchIntervalRule();            // 3 or 7 for patches, else null
  const p1 = document.getElementById("p1Interval");
  const p2 = document.getElementById("p2Interval");
  const p2Pct = parseFloat(document.getElementById("p2Percent")?.value || "");
  const p2Start = document.getElementById("p2StartDate")?._flatpickr?.selectedDates?.[0]
               || document.getElementById("p2StartDate")?.value || null;

  const [h1,h2] = ensureIntervalHints();
  let ok = true;

  // Default: clear
  if (h1) h1.textContent = "";
  if (h2) h2.textContent = "";
  p1?.classList.remove("invalid");
  p2?.classList.remove("invalid");

  // Static messages + validity gate only for patches
  if (rule){
    const msg = (rule === 3)
      ? "For Fentanyl patches, the interval must be a multiple of 3 days."
      : "For Buprenorphine patches, the interval must be a multiple of 7 days.";
    if (h1) h1.textContent = msg;
    if (h2) h2.textContent = msg;

    if (p1){
      const v = parseInt(p1.value, 10);
      const bad = !(Number.isFinite(v) && v>0 && v % rule === 0);
      if (bad){ p1.classList.add("invalid"); ok = false; }
    }
    const p2Active = p2 && p2.value && Number.isFinite(p2Pct) && p2Pct>0 && p2Start;
    if (p2Active){
      const v2 = parseInt(p2.value, 10);
      const bad2 = !(Number.isFinite(v2) && v2>0 && v2 % rule === 0);
      if (bad2){ p2.classList.add("invalid"); ok = false; }
    }
  }

  const gen = document.getElementById("generateBtn");
  if (gen) gen.disabled = gen.disabled || !ok;
  if (!ok && showToastToo && rule) alert((rule===3) ? "Patch intervals must be multiples of 3 days." : "Patch intervals must be multiples of 7 days.");
  return ok;
}

// Stable signature for a patch list (e.g., [75,12] -> "12+75")
function patchSignature(list) {
  const arr = Array.isArray(list) ? list.slice().map(Number).sort((a,b)=>a-b) : [];
  return arr.join("+"); // "" if no patches
}

/* ===== Minimal print / save helpers (do NOT duplicate elsewhere) ===== */

// PRINT: use your existing print CSS and guard against stale charts
function _printCSS(){
  return `<style>
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#000;background:#fff;margin:16px;}
    table{width:100%;border-collapse:separate;border-spacing:0 6px}
    thead th{text-align:left;padding:8px;border-bottom:1px solid #ddd}
    tbody td{border:1px solid #ddd;padding:8px;vertical-align:top}
    .instructions-pre{white-space:pre-line}
    @page{size:A4;margin:12mm}
  </style>`;
}
function printOutputOnly() {
  const tableExists = document.querySelector("#scheduleBlock table, #patchBlock table");
  if (!tableExists) { alert("Please generate a chart first."); return; }

  document.body.classList.add("printing");

  // Add print-only header + layout hints; get cleanup
  const cleanupDecor = preparePrintDecorations();

  window.print();

  setTimeout(() => {
    document.body.classList.remove("printing");
    cleanupDecor();
  }, 100);
}

// Save as PDF: export the chart only, with header on later pages and no split steps
async function saveOutputAsPdf() {
  // Same safety gate as Print
  if (window._dirtySinceGenerate) {
    const msg = "Inputs changed — please Generate Chart before saving.";
    if (typeof showToast === "function") showToast(msg); else alert(msg);
    return;
  }

  const card = document.getElementById("outputCard");
  if (!card || !card.querySelector("table")) {
    if (typeof showToast === "function") showToast("Generate a chart first.");
    return;
  }

  // --- 1) Clone just the output card we want to export
  const clone = card.cloneNode(true);

  // --- 2) Inject header + special instruction + disclaimer at top of the clone
  (function injectHeader(root) {
    // Remove any previously injected header
    root.querySelectorAll(".print-only").forEach(n => n.remove());

    const med = document.getElementById("hdrMedicine")?.textContent || "Medicine";
    const special = document.getElementById("hdrSpecial")?.textContent || "";
    const hdr = document.createElement("div");
    hdr.className = "print-only print-header";
    hdr.innerHTML = `
      <div class="print-medline">${med}</div>
      ${special ? `<div class="print-instruction">${special}</div>` : ``}
      <div class="print-disclaimer">This is a guide only – always follow the advice of your healthcare professional.</div>
    `;
    root.prepend(hdr);
  })(clone);

  // --- 3) Ensure later pages still show the column titles and avoid splitting a step
  splitTablesByStepForPdf(clone);

  // --- 4) Build an isolated HTML document for html2pdf, with the same print CSS + a few PDF-only tweaks
  const extraCss = `
    <style>
      /* Make html2pdf honor colors and keep layout tidy */
      html, body { background:#fff; color:#000; }
      .print-only { display:block !important; }
      /* Repeat header row per step (we create separate tables) */
      .step-table thead { display: table-header-group; }
      /* Do not split a step across pages */
      .step-table { page-break-inside: avoid; break-inside: avoid; margin: 0 0 10pt 0; }
      /* Avoid splitting a header from its first row */
      .step-table thead, .step-table tbody { page-break-inside: avoid; break-inside: avoid; }
    </style>
  `;

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      ${typeof _printCSS === "function" ? _printCSS() : ""} 
      ${extraCss}
    </head>
    <body>${clone.outerHTML}</body>
  </html>`;

  // --- 5) Render via an offscreen iframe so we export only this content
  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "100%";
  iframe.style.width = "0"; iframe.style.height = "0";
  document.body.appendChild(iframe);

  const filename = (() => {
    const t = (document.getElementById("hdrMedicine")?.textContent || "Deprescribing Plan")
      .replace(/^Medicine:\s*/i, "").replace(/\s+/g, "_");
    const d = new Date();
    return `${t}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.pdf`;
  })();

  const opts = {
    filename,
    pagebreak: { mode: ['css','legacy'], avoid: ['.step-table'] },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
    margin: [45, 34, 45, 34]  // ~16mm top/btm, ~12mm sides
  };

  try {
    await new Promise(res => {
      iframe.onload = res;
      iframe.src = url;
    });
    await html2pdf().set(opts).from(iframe.contentDocument.body).save();
  } catch (e) {
    console.error("saveOutputAsPdf error:", e);
    alert("Sorry — couldn’t create the PDF. See console for details.");
  } finally {
    URL.revokeObjectURL(url);
    iframe.remove();
  }
}

/* ---------- helper: split the main table into per-step tables so each has its own header ---------- */
function splitTablesByStepForPdf(root) {
  // Handle both tablet/caps (.plan-standard) and patch (.plan-patch) tables
  root.querySelectorAll("table.plan-standard, table.plan-patch").forEach(orig => {
    const thead = orig.querySelector("thead");
    const headHTML = thead ? thead.outerHTML : "";
    const groups = Array.from(orig.querySelectorAll("tbody.step-group"));
    if (!groups.length) return;

    const frag = document.createDocumentFragment();
    groups.forEach(tb => {
      const mini = document.createElement("table");
      mini.className = (orig.className + " step-table").trim();
      mini.innerHTML = headHTML;

      const body = document.createElement("tbody");
      body.className = tb.className; // preserve zebra classes etc.
      Array.from(tb.children).forEach(tr => body.appendChild(tr.cloneNode(true)));

      mini.appendChild(body);
      frag.appendChild(mini);
    });

    // Replace the big table with a list of small tables (one per step)
    orig.replaceWith(frag);
  });
}



// --- Suggested practice copy (exact wording from your doc) ---
const SUGGESTED_PRACTICE = {
  opioids: `Tailor the deprescribing plan based on the person’s clinical characteristics, goals and preferences. Consider:
• < 3 months use: reduce the dose by 10% to 25% every week
• >3 months use: reduce the dose by 10% to 25% every 4 weeks
• Long-term opioid use (e.g. 1> year) or on high doses: slower tapering and frequent monitoring
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,

  bzra: `• Taper slowly with the patient; e.g., 25% every 2 weeks.
• Near end: consider 12.5% reductions and/or planned drug-free days.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,

  antipsychotic: `• Reduce ~25–50% every 1–2 weeks with close monitoring.
• Slower taper may be appropriate depending on symptoms.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,

  ppi: `• Step-down to lowest effective dose, alternate-day dosing, or stop and use on-demand.
• Review at 4–12 weeks.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE]   [INSERT GUIDE TO RULESET]`,
};

// Normalize the dropdown label to one of our keys above
function mapClassToKey(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("benzodiazep")) return "bzra";
  if (s.includes("z-drug") || s.includes("z drug")) return "bzra";
  if (s.includes("antipsych")) return "antipsychotic";
  if (s.includes("proton") || s.includes("ppi")) return "ppi";
  // include patches under Opioids class as well
  if (s.includes("opioid") || s.includes("fentanyl") || s.includes("buprenorphine")) return "opioids";
  return null;
}

let _lastPracticeKey = null;

function updateBestPracticeBox() {
  const box = document.getElementById("bestPracticeBox");
  if (!box) return;

  const cls = document.getElementById("classSelect")?.value || "";
  const key = mapClassToKey(cls);

  if (!key) { box.innerHTML = ""; _lastPracticeKey = null; return; }

  // Guard: only update if the class changed
  if (key === _lastPracticeKey) return;
  _lastPracticeKey = key;

  const titleMap = {
    opioids: "Opioids",
    bzra: "Benzodiazepines / Z-Drugs (BZRA)",
    antipsychotic: "Antipsychotics",
    ppi: "Proton Pump Inhibitors",
  };

  const text = SUGGESTED_PRACTICE[key] || "";
  box.innerHTML = `
    <h2>Suggested practice for ${titleMap[key]}</h2>
    <div class="practice-text">
      ${text.split("\n").map(line => `<p>${line}</p>`).join("")}
    </div>
  `;
}

/* ---- Dirty state + gating ---- */
let _dirtySinceGenerate = true;

function showToast(msg) {
  let t = $("toastMsg");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastMsg";
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;opacity:.95;z-index:9999;font:13px/1.4 system-ui";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.display = "none"; }, 2200);
}

function setGenerateEnabled(){
  const pct  = parseFloat(document.getElementById("p1Percent")?.value || "");
  const intv = parseInt(document.getElementById("p1Interval")?.value || "", 10);

  // Enable Generate only when Phase 1 is complete
  const gen = document.getElementById("generateBtn");
  const ready = Number.isFinite(pct) && pct > 0 && Number.isFinite(intv) && intv > 0;
  if (gen) gen.disabled = !ready;

  // IMPORTANT: Do NOT touch Print/Save here.
  // setDirty(...) already disables/enables them using _dirtySinceGenerate.
  // (This removes the old window.dirty override.)
  
  // Keep the patch-interval extra rule if you had it:
  if (typeof validatePatchIntervals === "function") {
    validatePatchIntervals(false);
  }
}

function setDirty(v = true) {
  _dirtySinceGenerate = !!v;
  const printBtn = $("printBtn");
  const saveBtn  = $("savePdfBtn");
  if (printBtn) printBtn.disabled = _dirtySinceGenerate;
  if (saveBtn)  saveBtn.disabled  = _dirtySinceGenerate;
  setGenerateEnabled();
}

function watchDirty(selector) {
  document.querySelectorAll(selector).forEach(el => {
    ["change","input"].forEach(evt => el.addEventListener(evt, () => setDirty(true)));
  });
}

/* ===== digits/words helpers (fractional → words incl. whole) ===== */
function _smallIntToWords(n) {
  const map = {0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten'};
  return map[n] ?? String(n);
}
function qToCell(q){ // q = quarters of a tablet (for table cells)
  const tabs = q/4;
  const whole = Math.floor(tabs + 1e-6);
  const frac  = +(tabs - whole).toFixed(2);
  if (frac === 0) return String(whole);
  if (frac === 0.5)  return whole ? `${_smallIntToWords(whole)} and a half` : "half";
  if (frac === 0.25) return whole ? `${_smallIntToWords(whole)} and a quarter` : "a quarter";
  if (frac === 0.75) return whole ? `${_smallIntToWords(whole)} and three quarters` : "three quarters";
  return `${_smallIntToWords(whole)} and ${String(frac)} of a tablet`;
}
function tabletsPhraseDigits(q){ // instruction lines
  const tabs = q/4;
  const whole = Math.floor(tabs + 1e-6);
  const frac  = +(tabs - whole).toFixed(2);
  if (frac === 0) return `${whole===1?'1':String(whole)} ${whole===1?'tablet':'tablets'}`;
  if (frac === 0.5)  return whole ? `${_smallIntToWords(whole)} and a half tablets` : "half a tablet";
  if (frac === 0.25) return whole ? `${_smallIntToWords(whole)} and a quarter of a tablet` : "a quarter of a tablet";
  if (frac === 0.75) return whole ? `${_smallIntToWords(whole)} and three quarters of a tablet` : "three quarters of a tablet";
  return `${_smallIntToWords(whole)} and ${String(frac)} of a tablet`;
}
// Collapse pairs of 12/12.5 to 25 (repeat until no pairs remain)
function collapseFentanylTwelves(patches){
  const isTwelve = v => Math.abs(v - 12) < 0.01 || Math.abs(v - 12.5) < 0.01;
  let twelves = 0, others = [];
  for (const v of patches) (isTwelve(+v) ? twelves++ : others.push(+v));
  const pairs = Math.floor(twelves / 2);
  for (let i = 0; i < pairs; i++) others.push(25);
  if (twelves % 2 === 1) others.push(12);
  return others.sort((a, b) => b - a).slice(0, 2); // keep ≤2 patches
}
/* ===== Dose-form nouns for labels/instructions ===== */
function doseFormNoun(form) {
  if (/Patch/i.test(form)) return "patches";
  if (/Capsule/i.test(form)) return "capsules";
  if (/Orally\s*Dispersible\s*Tablet/i.test(form)) return "orally dispersible tablets";
  return "tablets";
}
/* =========================
   PRINT HEADER (shared)
   ========================= */
function renderPrintHeader(container){
  // remove old header if present
  const old = container.querySelector(".print-header");
  if (old) old.remove();

  const cls  = document.getElementById("classSelect")?.value || "";
  const med  = document.getElementById("medicineSelect")?.value || "";
  const form = document.getElementById("formSelect")?.value || "";

  // Medicine label: "<Generic> <form>" with no strength, form lowercased
  const formLabel = (form || "").replace(/\bTablet\b/i,"tablet")
                                 .replace(/\bPatch\b/i,"patch")
                                 .replace(/\bCapsule\b/i,"capsule")
                                 .replace(/\bOrally\s*Dispersible\s*Tablet\b/i,"orally dispersible tablet");

  // Special instruction (reuse your existing helper if present)
  let special = "";
  if (typeof specialInstructionFor === "function") {
    special = specialInstructionFor() || "";
  }

  const hdr = document.createElement("div");
  hdr.className = "print-header";
  const h1 = document.createElement("div");
  h1.className = "print-medline";
  h1.textContent = `Medicine: ${med} ${formLabel}`.trim();

  const h2 = document.createElement("div");
  h2.className = "print-instruction";
  h2.textContent = special;

  const h3 = document.createElement("div");
  h3.className = "print-disclaimer";
  h3.textContent = "This is a guide only – always follow the advice of your healthcare professional.";

  hdr.appendChild(h1);
  if (special) hdr.appendChild(h2);
  hdr.appendChild(h3);

  // insert header at the very top of container
  container.prepend(hdr);
}
/* ==========================================
   RENDER STANDARD (tablets/caps/ODT) TABLE
   - Merges date per step (rowspan)
   - Zebra per step-group (CSS)
   - Stop/Review merged cell after date
   ========================================== */

function renderStandardTable(stepRows){
  const scheduleHost = document.getElementById("scheduleBlock");
  const patchHost    = document.getElementById("patchBlock");
  if (!scheduleHost) return;

  // Screen: show tablets, hide patches
  scheduleHost.style.display = "";
  scheduleHost.innerHTML = "";
  if (patchHost) { patchHost.style.display = "none"; patchHost.innerHTML = ""; }

  // Table shell
  const table = document.createElement("table");
  table.className = "table plan-standard";

  // Column headers (on-screen unchanged)
  const thead = document.createElement("thead");
  const trCols = document.createElement("tr");
  ["Date beginning","Strength","Instructions","Morning","Midday","Dinner","Night"].forEach(t=>{
    const th = document.createElement("th");
    th.textContent = t;
    trCols.appendChild(th);
  });
  thead.appendChild(trCols);
  table.appendChild(thead);

  // 1) Expand each step into per-strength lines
  const expanded = [];
  (stepRows || []).forEach(step => {
    // STOP / REVIEW pass-through
    if (step.stop || step.review) {
      expanded.push({
        kind: step.stop ? "STOP" : "REVIEW",
        dateStr: step.dateStr || step.date || step.when || step.applyOn || ""
      });
      return;
    }
    const lines = (typeof perStrengthRowsFractional === "function")
      ? perStrengthRowsFractional(step)
      : [];

    lines.forEach(line => {
      expanded.push({
        kind: "LINE",
        dateStr: step.dateStr || step.date || step.when || step.applyOn || "",
        strength: line.strengthLabel || line.strength || "",
        instr: line.instructions || "",
        am:  (line.am   ?? line.morning ?? ""),
        mid: (line.mid  ?? line.midday  ?? ""),
        din: (line.din  ?? line.dinner  ?? ""),
        pm:  (line.pm   ?? line.night   ?? line.nocte ?? "")
      });
    });
  });

  // 2) Group by date (each group = one step = one <tbody>)
  const groups = [];
  let current = null, lastKey = null;
  expanded.forEach(row => {
    const key = (row.kind === "STOP" || row.kind === "REVIEW")
      ? `${row.kind}::${row.dateStr}`
      : row.dateStr;
    if (key !== lastKey) {
      current = { key, dateStr: row.dateStr || "", kind: row.kind, items: [] };
      groups.push(current); lastKey = key;
    }
    current.items.push(row);
  });

  // 3) Render groups with a consistent 7-cell layout (no rowspan)
  groups.forEach((g, idx) => {
    const tbody = document.createElement("tbody");
    tbody.className = "step-group " + (idx % 2 ? "step-even" : "step-odd");

    // STOP / REVIEW row (7 cells total: Date + message spanning 6)
    if (g.kind === "STOP" || g.kind === "REVIEW") {
      const tr = document.createElement("tr");
      tr.setAttribute("data-step", String(idx));
      if (idx % 2 === 1) tr.classList.add("zebra-even");

      const tdDate = document.createElement("td");
      tdDate.className = "col-date";
      tdDate.textContent = g.dateStr || "";

      const tdMsg = document.createElement("td");
      tdMsg.colSpan = 6;
      tdMsg.className = "final-cell";
      tdMsg.textContent = (g.kind === "STOP")
        ? "Stop."
        : "Review with your doctor the ongoing plan";

      tr.append(tdDate, tdMsg);
      tbody.appendChild(tr);
      table.appendChild(tbody);
      return;
    }

    // Normal date group
    const lines = g.items.filter(x => x.kind === "LINE");

    lines.forEach((line, i) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-step", String(idx));
      if (idx % 2 === 1) tr.classList.add("zebra-even");

      // [1] Date — first row shows the date; subsequent rows keep a blank spacer cell
      const tdDate = document.createElement("td");
      tdDate.className = "col-date";
      if (i === 0) {
        tdDate.textContent = g.dateStr || "";
      } else {
        tdDate.classList.add("date-spacer"); // visually merged date
        tdDate.textContent = "";            // keep column structure
      }
      tr.appendChild(tdDate);

      // [2] Strength
      const tdStrength = document.createElement("td");
      tdStrength.className = "col-strength";
      tdStrength.textContent = line.strength || "";
      tr.appendChild(tdStrength);

      // [3] Instructions — keep \n, print via textContent
      const tdInstr = document.createElement("td");
      tdInstr.className = "col-instr instructions-pre";
      tdInstr.textContent = (line.instr || "");
      tr.appendChild(tdInstr);

      // helper for dose cells
      const doseCell = (val, cls) => {
        const td = document.createElement("td");
        td.className = cls;
        td.textContent = (val ?? "") === "" ? "" : String(val);
        return td;
      };

      // [4..7] Morning / Midday / Dinner / Night
      tr.appendChild(doseCell(line.am,  "col-am"));
      tr.appendChild(doseCell(line.mid, "col-mid"));
      tr.appendChild(doseCell(line.din, "col-din"));
      tr.appendChild(doseCell(line.pm,  "col-pm"));

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
  });

  scheduleHost.appendChild(table);

  // Keep any footer label normalization you use elsewhere
  if (typeof normalizeFooterSpans === "function") normalizeFooterSpans();
}




/* =====================================================
   RENDER PATCH TABLE (fentanyl / buprenorphine)
   - Header rows (Medicine, Special instruction, Disclaimer) in THEAD (repeat each page)
   - Group contiguous rows with the SAME patch strengths into one <tbody> (zebra per dose range)
   - Stop/Review row shown with merged cell
   ===================================================== */
function renderPatchTable(stepRows) {
  const scheduleHost = document.getElementById("scheduleBlock");
  const host = document.getElementById("patchBlock");
  if (!host) return;

  // Show patches, hide tablets
  if (scheduleHost) { scheduleHost.style.display = "none"; scheduleHost.innerHTML = ""; }
  host.style.display = "";
  host.innerHTML = "";

  const table = document.createElement("table");
  table.className = "table plan-patch";

  // Column header row ONLY (on-screen look unchanged)
  const thead = document.createElement("thead");
  const trCols = document.createElement("tr");
  ["Apply on","Remove on","Patch strength(s)","Instructions"].forEach(t=>{
    const th = document.createElement("th"); th.textContent = t; trCols.appendChild(th);
  });
  thead.appendChild(trCols);
  table.appendChild(thead);

  // Group contiguous rows by identical patch set
  const groups = [];
  let cur = null;
  (stepRows || []).forEach(r => {
    const isFinal = r && (r.stop || r.review);
    if (isFinal) {
      if (cur && cur.items.length) { groups.push(cur); cur = null; }
      groups.push({ type: "final", item: r });
      return;
    }
    const sig = patchSignature(r.patches);
    if (!cur || cur.type !== "dose" || cur.sig !== sig) {
      if (cur && cur.items.length) groups.push(cur);
      cur = { type: "dose", sig, items: [] };
    }
    cur.items.push(r);
  });
  if (cur && cur.items.length) groups.push(cur);

  // Render groups
  const med = document.getElementById("medicineSelect")?.value || "";
  const everyDays = (/Fentanyl/i.test(med)) ? 3 : 7;

  groups.forEach((g, idx) => {
    const tbody = document.createElement("tbody");
    tbody.className = "step-group " + (idx % 2 ? "step-even" : "step-odd");

    if (g.type === "final") {
      const r = g.item || {};
      const tr = document.createElement("tr");

      const tdApply  = document.createElement("td");
      const tdMerged = document.createElement("td");

      tdApply.textContent =
        r.applyOnStr || r.dateStr ||
        (r.applyOn ? r.applyOn : (r.date ? (typeof fmtDMY==="function"? fmtDMY(r.date): String(r.date)) : ""));

      tdMerged.colSpan = 3;
      tdMerged.className = "final-cell";
      tdMerged.textContent = r.stop ? "Stop." : "Review with your doctor the ongoing plan";

      tr.append(tdApply, tdMerged);
      tbody.appendChild(tr);
      table.appendChild(tbody);
      return;
    }

    g.items.forEach(r => {
      const tr = document.createElement("tr");

      const tdApply  = document.createElement("td");
      const tdRemove = document.createElement("td");
      const tdStr    = document.createElement("td");
      const tdInstr  = document.createElement("td");

      tdApply.textContent =
        r.applyOnStr || r.dateStr ||
        (r.applyOn ? r.applyOn : (r.date ? (typeof fmtDMY==="function"? fmtDMY(r.date): String(r.date)) : ""));

      tdRemove.textContent =
        r.removeOnStr || r.removeStr ||
        (r.remove ? (typeof fmtDMY==="function"? fmtDMY(r.remove): String(r.remove)) : "");

      const list = Array.isArray(r.patches) ? r.patches.slice().map(Number).sort((a,b)=>a-b) : [];
      tdStr.textContent = list.length ? list.map(v => `${v} mcg/hr`).join(" + ") : "";

      const plural = list.length > 1 ? "patches" : "patch";
      tdInstr.textContent = `Apply ${plural} every ${everyDays} days.`;

      tr.append(tdApply, tdRemove, tdStr, tdInstr);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
  });

  host.appendChild(table);

  // Keep your existing footer normalization (if present)
  if (typeof normalizeFooterSpans === "function") normalizeFooterSpans();
}


/* =================== Catalogue (commercial only) =================== */

const CLASS_ORDER = ["Opioid","Benzodiazepines / Z-Drug (BZRA)","Antipsychotic","Proton Pump Inhibitor"];

const CATALOG = {
  Opioid: {
    Morphine: { "SR Tablet": ["5 mg","10 mg","15 mg","20 mg","30 mg","60 mg","100 mg","200 mg"] },
    Oxycodone: { "SR Tablet": ["5 mg","10 mg","15 mg","20 mg","30 mg","40 mg","60 mg","80 mg"] },
    "Oxycodone / Naloxone": { "SR Tablet": ["2.5/1.25 mg","5/2.5 mg","10/5 mg","15/7.5 mg","20/10 mg","30/15 mg","40/20 mg","60/30 mg","80/40 mg"] },
    Tapentadol: { "SR Tablet": ["50 mg","100 mg","150 mg","200 mg","250 mg"] },
    Tramadol: { "SR Tablet": ["50 mg","100 mg","150 mg","200 mg"] },
    Buprenorphine: { Patch: ["5 mcg/hr","10 mcg/hr","15 mcg/hr","20 mcg/hr","25 mcg/hr","30 mcg/hr","40 mcg/hr"] },
    Fentanyl: { Patch: ["12 mcg/hr","25 mcg/hr","50 mcg/hr","75 mcg/hr","100 mcg/hr"] },
  },
  "Benzodiazepines / Z-Drug (BZRA)": {
    Alprazolam: { Tablet: ["0.25 mg","0.5 mg","1 mg","2 mg"] },
    Clonazepam: { Tablet: ["0.5 mg","2 mg"] },
    Diazepam: { Tablet: ["2 mg","5 mg"] },
    Flunitrazepam: { Tablet: ["1 mg"] },
    Lorazepam: { Tablet: ["1 mg","2.5 mg"] },
    Nitrazepam: { Tablet: ["5 mg"] },
    Oxazepam: { Tablet: ["15 mg","30 mg"] },
    Temazepam: { Tablet: ["10 mg"] },
    Zolpidem: { Tablet: ["10 mg"], "Slow Release Tablet": ["12.5 mg","6.25 mg"] },
    Zopiclone: { Tablet: ["7.5 mg"] },
  },
  Antipsychotic: {
    Haloperidol: { Tablet: ["0.5 mg","1.5 mg","5 mg"] },
    Olanzapine: { Tablet: ["2.5 mg","5 mg","7.5 mg","10 mg","15 mg","20 mg"] },
    Quetiapine: { "Immediate Release Tablet": ["25 mg","100 mg","200 mg","300 mg"], "Slow Release Tablet": ["50 mg","150 mg","200 mg","300 mg","400 mg"] },
    Risperidone: { Tablet: ["0.5 mg","1 mg","2 mg","3 mg","4 mg"] },
  },
  "Proton Pump Inhibitor": {
    Esomeprazole: { Tablet: ["20 mg","40 mg"] },
    Lansoprazole: { "Orally Dispersible Tablet": ["15 mg","30 mg"], Tablet: ["15 mg","30 mg"] },
    Omeprazole: { Capsule: ["10 mg","20 mg"], Tablet: ["10 mg","20 mg"] },
    Pantoprazole: { Tablet: ["20 mg","40 mg"] },
    Rabeprazole: { Tablet: ["10 mg","20 mg"] },
  },
};

/* ===== Rounding minima (BZRA halves-only confirmed) ===== */
const BZRA_MIN_STEP = {
  Alprazolam: 0.25, Diazepam: 1.0, Flunitrazepam: 0.5, Lorazepam: 0.5,
  Nitrazepam: 2.5,  Oxazepam: 7.5, Temazepam: 5.0, Zolpidem: 5.0, Zopiclone: 3.75, Clonazepam: 0.25,
};
const AP_ROUND = { Haloperidol: 0.5, Risperidone: 0.5, Quetiapine: 12.5, Olanzapine: 1.25 };

/* =================== Parsing/labels =================== */

function isMR(form){ return /slow\s*release|modified|controlled|sustained/i.test(form) || /\b(SR|MR|CR|ER|XR|PR|CD)\b/i.test(form); }
function formLabelCapsSR(form){ return String(form||"").replace(/\bsr\b/ig,"SR"); }
function parseMgFromStrength(s){ const m = String(s||"").match(/^\s*([\d.]+)\s*(?:mg)?(?:\s*\/|$)/i); return m ? parseFloat(m[1]) : 0; }
function parsePatchRate(s){ const m=String(s||"").match(/([\d.]+)\s*mcg\/hr/i); return m?parseFloat(m[1]):0; }
function stripZeros(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/,"");
}

function oxyNxPairLabel(oxyMg){
  const oxy = +oxyMg;
  const nx  = +(oxy/2);
  return `Oxycodone ${stripZeros(oxy)} mg + naloxone ${stripZeros(nx)} mg SR tablet`;
}
/* =================== Dropdowns & dose lines =================== */

function populateClasses(){
  const el=$("classSelect"); if(!el) return; el.innerHTML="";
  CLASS_ORDER.forEach(c=>{ if(CATALOG[c]){ const o=document.createElement("option"); o.value=c; o.textContent=c; el.appendChild(o); }});
}
function populateMedicines(){
  const el=$("medicineSelect"), cls=$("classSelect")?.value; if(!el||!cls) return; el.innerHTML="";
  const meds=Object.keys(CATALOG[cls]||{});
  const ordered=(cls==="Opioid")
    ? ["Morphine","Oxycodone","Oxycodone / Naloxone","Tapentadol","Tramadol","Buprenorphine","Fentanyl"]
    : meds.slice().sort();
  ordered.forEach(m=>{ if(meds.includes(m)){ const o=document.createElement("option"); o.value=m; o.textContent=m; el.appendChild(o); }});
}
function populateForms(){
  const el=$("formSelect"), cls=$("classSelect")?.value, med=$("medicineSelect")?.value; if(!el||!cls||!med) return; el.innerHTML="";
  const forms=Object.keys((CATALOG[cls]||{})[med]||{}).sort((a,b)=>{
    const at=/Tablet/i.test(a)?0:/Patch/i.test(a)?1:/Capsule|Wafer|Dispersible/i.test(a)?2:9;
    const bt=/Tablet/i.test(b)?0:/Patch/i.test(b)?1:/Capsule|Wafer|Dispersible/i.test(b)?2:9;
    return at!==bt?at-b:a.localeCompare(b);
  });
  forms.forEach(f=>{ const o=document.createElement("option"); o.value=f; o.textContent=f; el.appendChild(o); });
}

/* ---- Dose lines (state) ---- */
let doseLines=[]; let nextLineId=1;

/* splitting rules */
function canSplitTablets(cls, form, med){
  if(/Patch|Capsule|Orally\s*Dispersible\s*Tablet/i.test(form) || isMR(form)) return {half:false, quarter:false};
  if(cls==="Opioid" || cls==="Proton Pump Inhibitor") return {half:false, quarter:false};
  if(cls==="Benzodiazepines / Z-Drug (BZRA)") return {half:true, quarter:false};
  if(cls==="Antipsychotic") return {half:true, quarter:false};
  return {half:true, quarter:true};
}

/* default frequency */
function defaultFreq(){
  const cls=$("classSelect")?.value, form=$("formSelect")?.value;
  if(form==="Patch") return "PATCH";
  if(cls==="Benzodiazepines / Z-Drug (BZRA)") return "PM";
  if(cls==="Proton Pump Inhibitor") return "DIN";
  if(cls==="Opioid" || cls==="Antipsychotic") return "BID";
  return "AM";
}

/* render dose lines */
function strengthsForSelected(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  return (CATALOG[cls]?.[med]?.[form]||[]).slice();
}
function resetDoseLinesToLowest(){
  const cls = $("classSelect")?.value, form = $("formSelect")?.value;
  const list = strengthsForSelected().sort((a,b)=>{
    if (/Patch/i.test(form)) return parsePatchRate(a) - parsePatchRate(b);
    return parseMgFromStrength(a) - parseMgFromStrength(b);
  });
  doseLines = [{ id: nextLineId++, strengthStr: list[0] || "", qty: 1, freqMode: defaultFreq() }];
  renderDoseLines();
}
function renderDoseLines(){
  const box=$("doseLinesContainer"); if(!box) return; box.innerHTML="";
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;

  doseLines.forEach((ln, idx)=>{
    const row=document.createElement("div"); row.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0";
    const noun = doseFormNoun(form);
    row.innerHTML=`<span class="badge">Line ${idx+1}</span>
      <span>Strength:</span><select class="dl-strength" data-id="${ln.id}"></select>
      <span>Number of ${noun}:</span><input class="dl-qty" data-id="${ln.id}" type="number" />
      <span>Frequency:</span><select class="dl-freq" data-id="${ln.id}"></select>
      <button type="button" class="secondary dl-remove" data-id="${ln.id}">Remove</button>`;
    box.appendChild(row);

    const sSel=row.querySelector(".dl-strength");
    const sList=strengthsForSelected().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
    sSel.innerHTML=""; sList.forEach(s=>{ const o=document.createElement("option"); o.value=s; o.textContent=s; sSel.appendChild(o); });
    sSel.value=ln.strengthStr || sList[0];

    const fSel=row.querySelector(".dl-freq"); fSel.innerHTML="";
    if(/Patch/i.test(form)){
      const o=document.createElement("option"); o.value="PATCH"; o.textContent=($("medicineSelect").value==="Fentanyl")?"Every 3 days":"Every 7 days";
      fSel.appendChild(o); fSel.disabled=true;
    } else if(cls==="Benzodiazepines / Z-Drug (BZRA)"){
      const o=document.createElement("option"); o.value="PM"; o.textContent="Daily at night";
      fSel.appendChild(o); fSel.disabled=true;
    } else if(cls==="Opioid" || cls==="Antipsychotic" || cls==="Proton Pump Inhibitor"){
      [
        ["AM","In the morning"],["MID","At midday"],["DIN","At dinner"],["PM","At night"],
        ["BID","Twice a day (morning & night)"],["TID","Three times a day"],["QID","Four times a day"]
      ].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=false;
    } else {
      [["AM","Daily in the morning"],["MID","Daily at midday"],["DIN","Daily at dinner"],["PM","Daily at night"]]
        .forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=false;
    }
    fSel.value=ln.freqMode || defaultFreq();

    sSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.strengthStr=e.target.value; setDirty(true); };
    fSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.freqMode=e.target.value; setDirty(true); };

    // Quantity constraints per form
    const qtyInput = row.querySelector(".dl-qty");
    const split = canSplitTablets(cls, form, med);
    if (/Patch/i.test(form)) {
      qtyInput.min = 0; qtyInput.max = 2; qtyInput.step = 1;
    } else {
      qtyInput.min = 0; qtyInput.max = 4;
      qtyInput.step = split.quarter ? 0.25 : (split.half ? 0.5 : 1);
    }
    qtyInput.value = (ln.qty ?? 1);

    qtyInput.onchange = (e)=>{
      const id=+e.target.dataset.id; let v=parseFloat(e.target.value);
      if(isNaN(v)) v=0;
      const min=parseFloat(e.target.min||"0"), max=parseFloat(e.target.max||"4"), step=parseFloat(e.target.step||"1");
      v=Math.max(min, Math.min(max, Math.round(v/step)*step));
      e.target.value=v;
      const l=doseLines.find(x=>x.id===id); if(l) l.qty=v;
      setDirty(true);
    };

    row.querySelector(".dl-remove").onclick=(e)=>{ const id=+e.target.dataset.id; doseLines=doseLines.filter(x=>x.id!==id); renderDoseLines(); setDirty(true); };
  });
}

/* =================== Suggested practice header =================== */

function specialInstructionFor(){
  const cls=$("classSelect")?.value || "";
  const med=$("medicineSelect")?.value || "";
  const form=$("formSelect")?.value || "";

  if(cls==="Benzodiazepines / Z-Drug (BZRA)" || cls==="Antipsychotic") return "";

  if (/Patch/i.test(form)) return "Special instruction: apply to intact skin as directed. Do not cut patches.";

  if (cls==="Proton Pump Inhibitor" && /Lansoprazole/i.test(med) && /Orally\s*Dispersible\s*Tablet/i.test(form)) {
    return "The orally dispersible tablet can be dispersed in the mouth.";
  }
  return "Swallow whole, do not halve or crush";
}
function updateRecommended(){
  const med  = $("medicineSelect")?.value || "";
  const form = $("formSelect")?.value || "";

  const hm = $("hdrMedicine");
  if (hm) hm.textContent = `Medicine: ${med} ${form}`;

  const hs = $("hdrSpecial");
  if (hs) hs.textContent = specialInstructionFor();
}

/* =================== Math / composition =================== */

function allowedPiecesMg(cls, med, form){
  const base = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0);
  const uniq=[...new Set(base)].sort((a,b)=>a-b);
  let pieces = uniq.slice();
  const split = canSplitTablets(cls,form,med);
  if(split.half)   uniq.forEach(v=>pieces.push(+(v/2).toFixed(3)));
  if(split.quarter)uniq.forEach(v=>pieces.push(+(v/4).toFixed(3)));
  return [...new Set(pieces)].sort((a,b)=>a-b);
}
function lowestStepMg(cls, med, form){
  if(cls==="Benzodiazepines / Z-Drug (BZRA)" && /Zolpidem/i.test(med) && isMR(form)) return 6.25;
  if(cls==="Benzodiazepines / Z-Drug (BZRA)" && BZRA_MIN_STEP[med]) return BZRA_MIN_STEP[med];
  if(cls==="Antipsychotic" && !isMR(form) && AP_ROUND[med]) return AP_ROUND[med];
  const mg = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b)[0]||0;
  const split = canSplitTablets(cls,form,med);
  return split.quarter ? +(mg/4).toFixed(3) : (split.half? +(mg/2).toFixed(3) : mg);
}
function composeExact(target, pieces){
  let rem=+target.toFixed(3), used={}; const arr=pieces.slice().sort((a,b)=>b-a);
  for(const s of arr){ const n=Math.floor(rem/s+1e-9); if(n>0){ used[s]=(used[s]||0)+n; rem=+(rem-n*s).toFixed(3); } }
  return Math.abs(rem)<EPS ? used : null;
}
function composeExactOrLower(target, pieces, step){
  const exact = composeExact(target, pieces); if(exact) return exact;
  for(let t=target; t>=0; t=+(t-step).toFixed(3)){
    const u = composeExact(t, pieces); if(u) return u;
  }
  return {};
}
function packsTotalMg(p){ const s=k=>Object.entries(p[k]||{}).reduce((a,[mg,c])=>a+mg*c,0); return s("AM")+s("MID")+s("DIN")+s("PM"); }
function slotTotalMg(p,slot){ return Object.entries(p[slot]||{}).reduce((a,[mg,c])=>a+mg*c,0); }

/* Build from UI */
function buildPacksFromDoseLines(){
  const cls=$("classSelect").value, med=$("medicineSelect").value, form=$("formSelect").value;
  const packs={AM:{},MID:{},DIN:{},PM:{}};
  const add=(slot,mg,count)=>{ packs[slot][mg]=(packs[slot][mg]||0)+count; };

  doseLines.forEach(ln=>{
    const baseMg = parseMgFromStrength(ln.strengthStr);
    const qty = parseFloat(ln.qty||1);
    const slots = (ln.freqMode==="PATCH") ? [] :
      (ln.freqMode==="BID" ? ["AM","PM"] :
       ln.freqMode==="TID" ? ["AM","MID","PM"] :
       ln.freqMode==="QID" ? ["AM","MID","DIN","PM"] : [ln.freqMode]);

    slots.forEach(sl=>{
      const split=canSplitTablets(cls,form,med);
      if(split.half||split.quarter){
        const qMg=+(baseMg/4).toFixed(3);
        const scale = split.quarter ? 4 : 2;
        const qCount=Math.round(qty*scale);
        add(sl,qMg,(split.quarter? qCount : qCount*2));
      } else {
        add(sl,baseMg,Math.round(qty));
      }
    });
  });

  if($("classSelect").value==="Benzodiazepines / Z-Drug (BZRA)"){ packs.AM={}; packs.MID={}; packs.DIN={}; }
  return packs;
}

/* ===== Per-slot composer ===== */
function composeForSlot(target, cls, med, form){
  const pieces = allowedPiecesMg(cls,med,form);
  const step = lowestStepMg(cls,med,form) || pieces[0] || 1;
  return composeExactOrLower(target, pieces, step);
}
function recomposeSlots(targets, cls, med, form){
  const out={AM:{},MID:{},DIN:{},PM:{}};
  for(const slot of ["AM","MID","DIN","PM"]) out[slot] = composeForSlot(targets[slot]||0, cls, med, form);
  return out;
}

/* ===== Preferred BID split ===== */
function preferredBidTargets(total, cls, med, form){
  const step = lowestStepMg(cls,med,form) || 1;
  const half = roundTo(total/2, step);
  let am = Math.min(half, total-half);
  let pm = total - am;
  am = roundTo(am, step); pm = roundTo(pm, step);
  if(am+pm !== total){
    const diff = total - (am+pm);
    pm = roundTo(pm+diff, step);
    if(am>pm){ const t=am; am=pm; pm=t; }
  }
  return {AM:am, PM:pm};
}

/* ===== Opioids (tablets) — shave DIN→MID then BID ===== */
function stepOpioid_Shave(packs, percent, cls, med, form){
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const step=strengths[0]||1;
  const tot=packsTotalMg(packs); if(tot<=EPS) return packs;
  let target = roundTo(tot*(1-percent/100), step);
  if(target===tot && tot>0){ target=Math.max(0, tot-step); target=roundTo(target,step); }
  let reduce = +(tot - target).toFixed(3);

  let cur = { AM: slotTotalMg(packs,"AM"), MID: slotTotalMg(packs,"MID"), DIN: slotTotalMg(packs,"DIN"), PM: slotTotalMg(packs,"PM") };

  const shave = (slot)=>{
    if(reduce<=EPS || cur[slot]<=EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, roundTo(reduce, step));
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce = +(reduce - dec).toFixed(3);
  };

  const hasDIN = cur.DIN>EPS;
  if(hasDIN){ shave("DIN"); shave("MID"); }
  else { shave("MID"); }

  if(reduce>EPS){
    const bidTarget = +(cur.AM + cur.PM - reduce).toFixed(3);
    const bid = preferredBidTargets(bidTarget, cls, med, form);
    cur.AM = bid.AM; cur.PM = bid.PM; reduce = 0;
  }

  for(const k of ["AM","MID","DIN","PM"]) if(cur[k]<EPS) cur[k]=0;
  return recomposeSlots(cur, cls, med, form);
}

/* ===== Proton Pump Inhibitor — reduce MID → PM → AM → DIN ===== */
function stepPPI(packs, percent, cls, med, form){
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const step=strengths[0]||1;
  const tot=packsTotalMg(packs); if(tot<=EPS) return packs;
  let target=roundTo(tot*(1-percent/100), step);
  if(target===tot && tot>0){ target=Math.max(0, tot-step); target=roundTo(target,step); }

  let cur = { AM: slotTotalMg(packs,"AM"), MID: slotTotalMg(packs,"MID"), DIN: slotTotalMg(packs,"DIN"), PM: slotTotalMg(packs,"PM") };
  let reduce= +(tot - target).toFixed(3);
  const shave = (slot)=>{
    if(reduce<=EPS || cur[slot]<=EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, roundTo(reduce, step));
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce = +(reduce - dec).toFixed(3);
  };
  shave("MID"); shave("PM"); shave("AM"); shave("DIN");
  return recomposeSlots(cur, cls, med, form);
}

/* ===== Antipsychotics ===== */
function stepAP(packs, percent, med, form){
  const isIR = !isMR(form);
  if(!isIR) return stepOpioid_Shave(packs, percent, "Antipsychotic", med, form); // SR like opioids

  const tot=packsTotalMg(packs); if(tot<=EPS) return packs;
  const step=AP_ROUND[med] || 0.5;
  let target=roundTo(tot*(1-percent/100), step);
  if(target===tot && tot>0){ target=Math.max(0, tot-step); target=roundTo(target,step); }

  let cur = { AM: slotTotalMg(packs,"AM"), MID: slotTotalMg(packs,"MID"), DIN: slotTotalMg(packs,"DIN"), PM: slotTotalMg(packs,"PM") };
  let reduce= +(tot - target).toFixed(3);
  const shave = (slot)=>{
    if(reduce<=EPS || cur[slot]<=EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, roundTo(reduce, step));
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce = +(reduce - dec).toFixed(3);
  };
  const hasDIN = cur.DIN > EPS, hasPM = cur.PM > EPS;
  let order;
  if (hasDIN && hasPM) order = ["MID","DIN","AM","PM"];
  else if (hasDIN || hasPM) order = ["MID","AM", hasDIN ? "DIN" : "PM"];
  else order = ["MID","AM"];
  order.forEach(shave);
  return recomposeSlots(cur, "Antipsychotic", med, form);
}

/* ===== BZRA ===== */
function stepBZRA(packs, percent, med, form){
  const tot=packsTotalMg(packs); if(tot<=EPS) return packs;
  const step = (!isMR(form) || !/Zolpidem/i.test(med)) ? (BZRA_MIN_STEP[med] || 0.5) : 6.25;
  let target = tot*(1-percent/100);
  const down = floorTo(target, step), up = ceilTo(target, step);
  target = (Math.abs(up-target) < Math.abs(target-down)) ? up : down; // ties up
  if(target===tot && tot>0){ target=Math.max(0, tot-step); target=roundTo(target,step); }
  const pm = composeForSlot(target, "Benzodiazepines / Z-Drug (BZRA)", med, form);
  return { AM:{}, MID:{}, DIN:{}, PM:pm };
}

/* =================== Plan builders (tablets) — date-based Phase-2 =================== */

const deepCopy = (o)=>JSON.parse(JSON.stringify(o));

function buildPlanTablets(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;

  const p1Pct = Math.max(0, parseFloat($("p1Percent")?.value || ""));
  const p1Int = Math.max(0, parseInt($("p1Interval")?.value || "", 10));

  const p2Pct = Math.max(0, parseFloat($("p2Percent")?.value || ""));
  const p2Int = Math.max(0, parseInt($("p2Interval")?.value || "", 10));
  const p2DateVal = $("p2StartDate")?._flatpickr?.selectedDates?.[0]
                   || ($("p2StartDate")?.value ? new Date($("p2StartDate")?.value) : null);
  const p2Start = (p2Pct>0 && p2Int>0 && p2DateVal && !isNaN(+p2DateVal)) ? p2DateVal : null;

  const startDate = $("startDate")?._flatpickr?.selectedDates?.[0]
                    || ($("startDate")?.value ? new Date($("startDate").value) : new Date());
  const reviewDate = $("reviewDate")?._flatpickr?.selectedDates?.[0]
                    || ($("reviewDate")?.value ? new Date($("reviewDate").value) : null);

  if (!(p1Pct>0 && p1Int>0)) { showToast("Enter a percentage and an interval to generate a plan."); return []; }

  let packs=buildPacksFromDoseLines();
  if (packsTotalMg(packs) === 0) return [];

  const rows=[]; let date=new Date(startDate); const capDate=new Date(+startDate + THREE_MONTHS_MS);

  const doStep = (phasePct) => {
    if (cls === "Opioid") packs = stepOpioid_Shave(packs, phasePct, cls, med, form);
    else if (cls === "Proton Pump Inhibitor") packs = stepPPI(packs, phasePct, cls, med, form);
    else if (cls === "Benzodiazepines / Z-Drug (BZRA)") packs = stepBZRA(packs, phasePct, med, form);
    else packs = stepAP(packs, phasePct, med, form);
  };

  // Step 1 on start date using whichever phase applies at start
  const useP2Now = p2Start && (+startDate >= +p2Start);
  doStep(useP2Now ? p2Pct : p1Pct);
  if (packsTotalMg(packs) > EPS) rows.push({ week: 1, date: fmtDate(date), packs: deepCopy(packs), med, form, cls });

  let week=1;
  while (packsTotalMg(packs) > EPS) {
    const nextByP1 = addDays(date, p1Int);
    const nextByP2 = addDays(date, p2Int);
    let nextDate;

    if (p2Start && +date < +p2Start) {
      nextDate = (+nextByP1 > +p2Start) ? new Date(p2Start) : nextByP1;
    } else if (p2Start && +date >= +p2Start) {
      nextDate = nextByP2;
    } else {
      nextDate = nextByP1;
    }

    if (reviewDate && +nextDate >= +reviewDate) { rows.push({ week: week+1, date: fmtDate(reviewDate), packs:{}, med, form, cls, review:true }); break; }
    if (+nextDate - +startDate >= THREE_MONTHS_MS) { rows.push({ week: week+1, date: fmtDate(nextDate), packs:{}, med, form, cls, review:true }); break; }

    date = nextDate; week++;
    const nowInP2 = p2Start && (+date >= +p2Start);
    doStep(nowInP2 ? p2Pct : p1Pct);

    if (packsTotalMg(packs) > EPS) rows.push({ week, date: fmtDate(date), packs: deepCopy(packs), med, form, cls });
    if (week > MAX_WEEKS) break;
  }

  if (packsTotalMg(packs) <= EPS) rows.push({ week: week+1, date: fmtDate(date), packs: {}, med, form, cls, stop:true });

  setDirty(false);
  return rows;
}

/* =================== Patches builder — date-based Phase-2; start at step 2 =================== */

function patchAvailList(med){ return (med==="Fentanyl") ? [12,25,50,75,100] : [5,10,15,20,25,30,40]; }
function combosUpTo(avail, maxPatches = 2){
  const sums = new Map(); // total -> best combo (fewest patches, higher strengths on tie)
  function consider(arr){
    const total = arr.reduce((a,b)=>a+b,0);
    const sorted = arr.slice().sort((a,b)=>b-a);
    if(!sums.has(total)) { sums.set(total, sorted); return; }
    const ex = sums.get(total);
    if (sorted.length < ex.length) { sums.set(total, sorted); return; }
    if (sorted.length === ex.length) {
      for (let i=0; i<sorted.length; i++){
        if (sorted[i]===ex[i]) continue;
        if (sorted[i] > ex[i]) { sums.set(total, sorted); }
        break;
      }
    }
  }

  // 1-patch combos
  for (let i=0; i<avail.length; i++) consider([avail[i]]);

  if (maxPatches >= 2) {
    // 2-patch combos (allow same strength twice)
    for (let i=0; i<avail.length; i++){
      for (let j=i; j<avail.length; j++){
        consider([avail[i], avail[j]]);
      }
    }
  }
  return sums;
}function fentanylDesiredGrid(x){
  // nearest multiple of 12.5, tie → up, then display-adjust (12.5→12 etc.)
  const lower = Math.floor(x/12.5)*12.5;
  const upper = Math.ceil(x/12.5)*12.5;
  let pick;
  if (Math.abs(x-lower) < Math.abs(upper-x)) pick = lower;
  else if (Math.abs(x-lower) > Math.abs(upper-x)) pick = upper;
  else pick = upper;
  if (Math.abs(pick - Math.round(pick)) > 1e-9) pick -= 0.5; // 12.5→12, 37.5→37, etc.
  return Math.round(pick);
}
function choosePatchTotal(prevTotal, target, med){
  const avail = patchAvailList(med);
  const sums  = combosUpTo(avail, 2); // ≤ 2 patches

  // Desired grid for fentanyl (12.5 grid with your 12.5→12 display convention)
  const desired = (med === "Fentanyl") ? fentanylDesiredGrid(target) : target;

  // Totals we can make without increasing from previous
  const cand = [...sums.keys()].filter(t => t <= prevTotal + 1e-9);
  if (cand.length === 0) return { total: prevTotal, combo: [prevTotal] };

  // Sort by closeness to desired; tie → higher total (you prefer the closer, then higher)
  cand.sort((a,b) => {
    const da = Math.abs(a - desired), db = Math.abs(b - desired);
    if (Math.abs(da - db) > 1e-9) return da - db;
    return b - a;
  });

  let pick  = cand[0];
  let combo = (sums.get(pick) || [pick]).slice();

  if (med === "Fentanyl") {
    // Collapse twelves for selection-time logic (not just display)
    let collapsed = collapseFentanylTwelves(combo);
    let collapsedTotal = collapsed.reduce((s,v)=>s+v, 0);

    // If the collapsed total would *display* the same as the previous total,
    // walk down to the next candidate whose collapsed total is strictly lower.
    if (Math.abs(collapsedTotal - prevTotal) < 1e-9) {
      let replaced = false;
      for (let i = 1; i < cand.length; i++) {
        const t  = cand[i];
        const cc = (sums.get(t) || [t]).slice();
        const ccCollapsed = collapseFentanylTwelves(cc);
        const ccTotal     = ccCollapsed.reduce((s,v)=>s+v, 0);
        if (ccTotal < prevTotal - 1e-9) {
          pick       = t;
          combo      = ccCollapsed;
          collapsed  = ccCollapsed;
          collapsedTotal = ccTotal;
          replaced   = true;
          break;
        }
      }
      if (!replaced) {
        // fallback: keep collapsed pick
        combo = collapsed;
        pick  = collapsedTotal;
      }
    } else {
      // accept the collapsed combo
      combo = collapsed;
      pick  = collapsedTotal;
    }

    // Final safety: if still equal to previous, step down once more if possible
    if (Math.abs(pick - prevTotal) < 1e-9) {
      const lower = cand.find(x => x < prevTotal - 1e-9);
      if (lower != null) {
        const lc  = (sums.get(lower) || [lower]).slice();
        const lcc = collapseFentanylTwelves(lc);
        pick  = lcc.reduce((s,v)=>s+v,0);
        combo = lcc;
      }
    }
    return { total: pick, combo };
  }

  // Non-fentanyl: keep your original “no-stagnation” guard
  if (Math.abs(pick - prevTotal) < 1e-9) {
    const lower = cand.find(x => x < prevTotal - 1e-9);
    if (lower != null) { pick = lower; combo = sums.get(lower) || [lower]; }
  }
  return { total: pick, combo };
}

function buildPlanPatch(){
  const med=$("medicineSelect").value;
  const startDate=$("startDate")?($("startDate")._flatpickr?.selectedDates?.[0]||new Date()):new Date();
  const reviewDate=$("reviewDate")?($("reviewDate")._flatpickr?.selectedDates?.[0]||null):null;

  const applyEvery=(med==="Fentanyl")?3:7;

  const p1Pct = Math.max(0, parseFloat($("p1Percent")?.value || ""));
  const p1Int = Math.max(0, parseInt($("p1Interval")?.value || "", 10));

  const p2Pct = Math.max(0, parseFloat($("p2Percent")?.value || ""));
  const p2Int = Math.max(0, parseInt($("p2Interval")?.value || "", 10));
  const p2DateVal = $("p2StartDate")?._flatpickr?.selectedDates?.[0]
                   || ($("p2StartDate")?.value ? new Date($("p2StartDate")?.value) : null);
  const p2Start = (p2Pct>0 && p2Int>0 && p2DateVal && !isNaN(+p2DateVal)) ? p2DateVal : null;

  if (!(p1Pct>0 && p1Int>0)) { showToast("Enter a percentage and an interval to generate a plan."); return []; }

  const strengths=strengthsForSelected().map(parsePatchRate).filter(v=>v>0).sort((a,b)=>b-a);
  const smallest=strengths[strengths.length-1];

  // Start total = Σ (strength × quantity)
  let startTotal = 0;
  doseLines.forEach(ln => {
    const mg = parsePatchRate(ln.strengthStr) || 0;
    const qty = Math.max(0, Math.floor((ln.qty ?? 0)));
    startTotal += mg * qty;
  });
if (startTotal <= 0) {
  showToast("Add at least one patch (quantity > 0) before generating.");
   return [];
 }
  const rows=[];
  let curApply = new Date(startDate);
  let curRemove = addDays(curApply, applyEvery);

  let prevTotal = startTotal;
  let current = prevTotal;
  let currentCombo = [prevTotal];

  let currentPct = p1Pct, currentReduceEvery = p1Int;
  let nextReductionCutoff = new Date(startDate); // first reduction on start date

  const capDate = new Date(+startDate + THREE_MONTHS_MS);
  let smallestAppliedOn = null;
  let stopThresholdDate = null;

  const pushRow = () => rows.push({ date: fmtDate(curApply), remove: fmtDate(curRemove), patches: currentCombo.slice(), med, form:"Patch" });
  const pushFinal = (type, whenDate) => rows.push({ date: fmtDate(whenDate), patches: [], med, form:"Patch", stop:(type==='stop'), review:(type==='review') });

  let week = 1; let startedReducing=false; let p2Armed = !!p2Start;

  while(true){
    // Phase-2: switch parameters on the first Apply-on ≥ p2Start
    if (p2Armed && +curApply >= +p2Start) {
      currentPct = p2Pct; currentReduceEvery = p2Int;
      nextReductionCutoff = new Date(curApply); // allow immediate P2 reduction at this apply
      p2Armed = false;
    }

    if (+curApply >= +nextReductionCutoff) {
      const rawTarget = prevTotal * (1 - currentPct/100);
      const pick = choosePatchTotal(prevTotal, rawTarget, med);
      current = pick.total; currentCombo = pick.combo.slice();
      nextReductionCutoff = addDays(nextReductionCutoff, currentReduceEvery);
      if(!startedReducing) startedReducing=true;

if (current <= smallest + 1e-9 && !smallestAppliedOn){
  smallestAppliedOn = new Date(curApply);
 const holdDaysForLowest = currentReduceEvery;
  stopThresholdDate = addDays(smallestAppliedOn, holdDaysForLowest);
}

      prevTotal = current;
    }

    if (startedReducing) pushRow();

const candidateStop = (stopThresholdDate && (+curRemove >= +stopThresholdDate - 1e-9))
  ? new Date(curRemove) : null;

let finalType=null, finalDate=null;
if (reviewDate && (!candidateStop || +reviewDate <= +candidateStop)) {
  finalType='review'; finalDate=new Date(reviewDate);
}
if (!finalDate && (+capDate <= +curRemove)) {
  finalType='review'; finalDate=new Date(capDate);
}
if (!finalDate && candidateStop) {
  finalType='stop'; finalDate=candidateStop;
}
if (finalDate) { pushFinal(finalType, finalDate); break; }

    curApply  = addDays(curApply, applyEvery);
    curRemove = addDays(curRemove, applyEvery);
    week++; if (week > MAX_WEEKS) break;
  }

  setDirty(false);
  return rows;
}

/* =================== Renderers =================== */

function td(text, cls){ const el=document.createElement("td"); if(cls) el.className=cls; el.textContent=text||""; return el; }

/* Fractional grouping for BZRA/AP-IR */
function perStrengthRowsFractional(r){
  const baseAsc = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const baseDesc = baseAsc.slice().sort((a,b)=>b-a);
  const split = canSplitTablets(r.cls, r.form, r.med);
  const byBase = {}; const ensure = (b)=>{ byBase[b]=byBase[b]||{AM:0,MID:0,DIN:0,PM:0}; return byBase[b]; };

  ["AM","MID","DIN","PM"].forEach(slot=>{
    Object.entries(r.packs[slot]||{}).forEach(([pieceStr, count])=>{
      const piece=+pieceStr; let mapped=false;
      for(const b of baseDesc){ if(Math.abs(piece - b) < 1e-6){ ensure(b)[slot] += 4*count; mapped=true; break; } }
      if(mapped) return;
      if(split.half){ for(const b of baseDesc){ if(Math.abs(piece - b/2) < 1e-6){ ensure(b)[slot] += 2*count; mapped=true; break; } } }
      if(mapped) return;
      if(split.quarter){ for(const b of baseDesc){ if(Math.abs(piece - b/4) < 1e-6){ ensure(b)[slot] += 1*count; mapped=true; break; } } }
      if(mapped) return;
      const b0 = baseDesc[0];
      const qApprox = Math.max(1, Math.round(piece/(b0/4)));
      ensure(b0)[slot] += qApprox * count;
    });
  });

  const rows=[];
  const mkCell = (q)=> q ? qToCell(q) : "";

  const bases = Object.keys(byBase).map(parseFloat).sort((a,b)=>{
    const aHasAM = byBase[a].AM>0, bHasAM = byBase[b].AM>0;
    if(aHasAM!==bHasAM) return aHasAM ? -1 : 1;
    return b-a;
  });

  bases.forEach(b=>{
    const q=byBase[b], lines=[];
    if(q.AM)  lines.push(`Take ${tabletsPhraseDigits(q.AM)} in the morning`);
    if(q.MID) lines.push(`Take ${tabletsPhraseDigits(q.MID)} at midday`);
    if(q.DIN) lines.push(`Take ${tabletsPhraseDigits(q.DIN)} at dinner`);
    if(q.PM)  lines.push(`Take ${tabletsPhraseDigits(q.PM)} at night`);
    rows.push({
      strengthLabel: `${r.med} ${b} mg ${/Tablet$/i.test(r.form)?"Tablet":formLabelCapsSR(r.form)}`,
      instructions: lines.join("\n"),
      am: mkCell(q.AM), mid: mkCell(q.MID), din: mkCell(q.DIN), pm: mkCell(q.PM)
    });
  });
  return rows;
}

/* =================== Footer =================== *//* =================== Footer =================== */

function setFooterText(cls){
  const exp = {
    Opioid: "Expected benefits: Improved function and reduced opioid-related harms.",
    "Benzodiazepines / Z-Drug (BZRA)": "Improved cognition, daytime alertness, and reduced falls.",
    "Proton Pump Inhibitor": "Review at 4–12 weeks; incorporate non-drug strategies (sleep, diet, positioning).",
    Antipsychotic: "Lower risk of metabolic/extrapyramidal adverse effects.",
  }[cls] || "—";
  const wdr = {
    Opioid: "transient pain flare, cravings, mood changes.",
    "Benzodiazepines / Z-Drug (BZRA)": "insomnia, anxiety, irritability.",
    "Proton Pump Inhibitor": "rebound heartburn.",
    Antipsychotic: "sleep disturbance, anxiety, return of target symptoms.",
  }[cls] || "—";
const e = $("expBenefits");     if (e) e.textContent = exp;
const w = $("withdrawalInfo");  if (w) w.textContent = wdr;
}

/* =================== Build & init =================== */

function buildPlan(){
  // Patch-specific guard: enforce multiples (Fentanyl ×3d, Buprenorphine ×7d)
  if (typeof patchIntervalRule === "function" &&
      typeof validatePatchIntervals === "function" &&
      patchIntervalRule() && !validatePatchIntervals(true)) {
    return; // invalid interval → abort build
  }

  const cls  = document.getElementById("classSelect")?.value;
  const med  = document.getElementById("medicineSelect")?.value;
  const form = document.getElementById("formSelect")?.value;

  if (!cls || !med || !form) {
    alert("Please select a class, medicine, and form first.");
    return;
  }

  let rows = [];
  if (/Patch/i.test(form)) {
    // Patches
    rows = (typeof buildPlanPatch === "function") ? buildPlanPatch() : [];
    if (typeof renderPatchTable === "function") renderPatchTable(rows);
  } else {
    // Tablets/capsules/ODT etc.
    rows = (typeof buildPlanTablets === "function") ? buildPlanTablets() : [];
    if (typeof renderStandardTable === "function") renderStandardTable(rows);
  }

  setGenerateEnabled(); // keep button/print gating in sync
  setDirty(false);
}

function updateRecommendedAndLines(){
  populateMedicines(); populateForms(); updateRecommended(); applyPatchIntervalAttributes(); resetDoseLinesToLowest();
  setFooterText($("classSelect")?.value);
  setDirty(true);
}

function init(){
  // 1) Date pickers (flatpickr if present; otherwise fallback to <input type="date">)
  document.querySelectorAll(".datepick").forEach(el=>{
    if (window.flatpickr) {
      window.flatpickr(el, { dateFormat: "d/m/Y", allowInput: true });
    } else {
      try { el.type = "date"; } catch(_) {}
    }
  });

  // 2) Clear Phase-1 presets (placeholders only)
  const p1PctEl = document.getElementById("p1Percent");
  const p1IntEl = document.getElementById("p1Interval");
  if (p1PctEl) { p1PctEl.value = ""; p1PctEl.placeholder = "%"; }
  if (p1IntEl) { p1IntEl.value = ""; p1IntEl.placeholder = "days"; }

  // 3) Populate selects and force an initial selection
  populateClasses();
  populateMedicines();
  populateForms();
  resetDoseLinesToLowest();
  updateRecommended();
  applyPatchIntervalAttributes();
  if (typeof setFooterText === "function") setFooterText(document.getElementById("classSelect")?.value || "");

  // 4) Change handlers for dependent selects
  document.getElementById("classSelect")?.addEventListener("change", () => {
    populateMedicines();
    populateForms();
    updateRecommended();
    applyPatchIntervalAttributes();
    if (typeof setFooterText === "function") setFooterText(document.getElementById("classSelect")?.value || "");
    resetDoseLinesToLowest();
    setDirty(true);
    setGenerateEnabled();
    if (typeof validatePatchIntervals === "function") validatePatchIntervals(false);
  });

  document.getElementById("medicineSelect")?.addEventListener("change", () => {
    populateForms();
    updateRecommended();
    applyPatchIntervalAttributes();
    if (typeof setFooterText === "function") setFooterText(document.getElementById("classSelect")?.value || "");
    resetDoseLinesToLowest();
    setDirty(true);
    setGenerateEnabled();
    if (typeof validatePatchIntervals === "function") validatePatchIntervals(false);
  });

  document.getElementById("formSelect")?.addEventListener("change", () => {
    updateRecommended();
    applyPatchIntervalAttributes();
    resetDoseLinesToLowest();
    setDirty(true);
    setGenerateEnabled();
    if (typeof validatePatchIntervals === "function") validatePatchIntervals(false);
  });

  // 5) Add dose line button
  document.getElementById("addDoseLineBtn")?.addEventListener("click", ()=>{
    const sList = strengthsForSelected();
    doseLines.push({
      id: (typeof nextLineId !== "undefined" ? nextLineId++ : Date.now()),
      strengthStr: sList && sList.length ? sList[0] : "",
      qty: 1,
      freqMode: defaultFreq()
    });
    renderDoseLines();
    setDirty(true);
  });

  // 6) Main actions
  document.getElementById("generateBtn")?.addEventListener("click", buildPlan);
  document.getElementById("resetBtn")?.addEventListener("click", ()=>location.reload());
  document.getElementById("printBtn")?.addEventListener("click", printOutputOnly);
  document.getElementById("savePdfBtn")?.addEventListener("click", saveOutputAsPdf);
 document.getElementById("classSelect")?.addEventListener("change", updateBestPracticeBox);

   updateBestPracticeBox();
  
  // 7) Live gating + interval hints for patches
  if (typeof ensureIntervalHints === "function") ensureIntervalHints(); // create the hint <div>s once
  const rewire = (id)=>{
    const el = document.getElementById(id);
    if (!el) return;
    ["input","change"].forEach(evt=>{
      el.addEventListener(evt, ()=>{
        setGenerateEnabled();
        if (typeof validatePatchIntervals === "function") validatePatchIntervals(false);
      });
    });
  };
  ["p1Interval","p2Interval","p2Percent","p2StartDate","medicineSelect","formSelect","p1Percent"].forEach(rewire);

  // 8) Dirty tracking (keep your selector list)
  if (typeof watchDirty === "function") {
    watchDirty("#classSelect, #medicineSelect, #formSelect, #startDate, #reviewDate, #p1Percent, #p1Interval, #p2Percent, #p2Interval, #p2StartDate");
  }

  // 9) Initial gate/hints
  setDirty(true);
  setGenerateEnabled();
  if (typeof validatePatchIntervals === "function") validatePatchIntervals(false);
}

document.addEventListener("DOMContentLoaded", ()=>{ try{ init(); } catch(e){ console.error(e); alert("Init error: "+(e?.message||String(e))); }});
