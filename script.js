/* ============================================================================
  Deprescribing Taper Planner — script.js (Organized Edition)
  Non-destructive organization: header + foldable regions only.
============================================================================ */
"use strict";

/* ===================== TABLE OF CONTENTS =====================
  1.  Constants & Tiny Utilities
  2.  Patch Interval Rules (safety)
  3.  Print / PDF Helpers & Decorations
  4.  Dose Distribution Helpers (BID/TDS etc.)
  5.  Renderers: Standard (tablets/caps) & Patch
  6.  Catalogue & Form Labels
  7.  Suggested Practice / Footers (copy)
  8.  UI State, Dirty Flags, Toasts
  9.  Validation & Gating (enable/disable)
  10. Event Wiring
  11. Boot / Init
============================================================== */

"use strict";

/* ====================== Helpers ====================== */

const $ = (id) => document.getElementById(id);
//#region 1. Constants & Tiny Utilities
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
//#endregion
//#region 2. Patch Interval Rules (safety)
function patchIntervalRule(){
//#endregion
//#region 10. Event Wiring
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
function trimMg(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return String(v).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formSuffixWithSR(formLabel) {
  const f = String(formLabel || '').toLowerCase();
  if (f.includes('patch'))   return 'patch';
  if (f.includes('sr') && f.includes('tablet')) return 'SR Tablet';
  if (f.includes('tablet'))  return 'Tablet';
  if (f.includes('capsule')) return 'Capsule';
  return 'Tablet'; // safe default for tablet-like forms
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
//#endregion
//#region 9. Validation & Gating
    setGenerateEnabled();
  });
  inp._patchSnapAttached = true;
}
  });
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

// Choose "Tablets" vs "Capsules" for Gabapentin based on strength.
// - 600 & 800 mg → Tablets
// - 100, 300, 400 mg → Capsules
// Falls back to your existing doseFormNoun(form) for everything else.
function nounForGabapentinByStrength(form, med, strengthStr){
  try {
    if (med === "Gabapentin" && (form === "Tablet/Capsule" || form === "Tablet" || form === "Capsule")) {
      // Use your existing strength parser if present
      const mg = (typeof parseMgFromStrength === "function")
        ? parseMgFromStrength(strengthStr)
        : (parseFloat(String(strengthStr).replace(/[^\d.]/g,"")) || 0);

      // Prefer a provided mapping if it exists in your script
      let kind = (typeof GABA_FORM_BY_STRENGTH !== "undefined" && GABA_FORM_BY_STRENGTH)
        ? GABA_FORM_BY_STRENGTH[mg]
        : null;

      // Fallback mapping from your requirement
      if (!kind) {
        if (mg === 600 || mg === 800) kind = "Tablet";
        else if (mg === 100 || mg === 300 || mg === 400) kind = "Capsule";
      }

      if (kind) return (kind === "Tablet") ? "Tablets" : "Capsules";
    }
  } catch (_) {}

  // Default for non-gabapentin or if something unexpected happens
  return (typeof doseFormNoun === "function") ? doseFormNoun(form) : "Units";
}

// Selected formulations (by mg base). Empty Set => "use all".
let SelectedFormulations = new Set();

function shouldShowProductPicker(cls, med, form){
  // Limit to the medicines you specified
  const isOpioidSR = cls === "Opioid" && /SR/i.test(form) && /Tablet/i.test(form);
  const allowList = [
    // Opioids SR tablet
    ["Opioid","Morphine",/SR/i],
    ["Opioid","Oxycodone",/SR/i],
    ["Opioid","Oxycodone \/ Naloxone",/SR/i],
    ["Opioid","Tapentadol",/SR/i],
    ["Opioid","Tramadol",/SR/i],
    // Gabapentinoids
    ["Gabapentinoids","Gabapentin",/.*/],
    ["Gabapentinoids","Pregabalin",/Capsule/i]
  ];

  return allowList.some(([c,m,formRe]) =>
    c===cls && new RegExp(m,"i").test(med||"") && formRe.test(form||"")
  );
}

// Build a nice per-product label
function strengthToProductLabel(cls, med, form, strengthStr){
  const mg = parseMgFromStrength(strengthStr);

  // ✅ Special case: Gabapentin shows simplified labels and uses true form by strength
  if (/^Gabapentin$/i.test(med)) {
    const f = gabapentinFormForMg(mg).toLowerCase(); // "tablet" / "capsule"
    return `${stripZeros(mg)} mg ${f}`;
  }

  // Oxycodone/naloxone pair label stays as-is
  if (/Oxycodone\s*\/\s*Naloxone/i.test(med)) {
    return oxyNxPairLabel(mg); // e.g., "Oxycodone 20 mg + naloxone 10 mg SR tablet"
  }

  // Everyone else uses your normal suffix logic
  return `${med} ${stripZeros(mg)} mg ${formSuffixWithSR(form)}`;
}

// Which strengths are available for the picker (we use whatever the current Form provides)
// For Gabapentin you already expose both tablet & capsule strengths via “Tablet/Capsule”.
function strengthsForPicker(){
  return strengthsForSelected().slice().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
}

// Filtered bases depending on checkbox selection (empty => all)
function allowedStrengthsFilteredBySelection(){
  const all = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0);
  if (!SelectedFormulations || SelectedFormulations.size === 0) return all;
  return all.filter(mg => SelectedFormulations.has(mg));
}
// Returns the mg list to use for the step size: if user selected formulations, use those;
// otherwise use all available strengths for the current selection.
function stepBaseStrengthsMg(cls, med, form){
  const picked = selectedProductMgs();
  let mgList = picked && picked.length
    ? picked.slice()
    : strengthsForSelectedSafe(cls, med, form);

  mgList = [...new Set(mgList)].filter(v => v > 0).sort((a,b)=>a-b);
  if (mgList.length) return mgList;

  // Last-ditch fallbacks per medicine (keeps the app moving)
  if (/^Gabapentin$/i.test(med)) return [100];
  if (/^Pregabalin$/i.test(med)) return [25];
  return [5]; // generic (SR opioids usually have 5 mg somewhere)
}

// Effective step size = smallest base strength in use (selected or all)
function lowestStepMg(cls, med, form){
  const mgList = stepBaseStrengthsMg(cls, med, form);
  return (mgList && mgList.length) ? mgList[0] : 5;
}

// Snap a %-reduced target to the effective step size.
// Policy: round UP to avoid under-dose; if unchanged, nudge down by one step for progress.
function snapTargetToSelection(totalMg, percent, cls, med, form){
  const step = lowestStepMg(cls, med, form) || 1;
  const raw  = totalMg * (1 - percent/100);

  const down = Math.floor(raw / step) * step;
  const up   = Math.ceil(raw / step) * step;

  let target;
  const dDown = raw - down;
  const dUp   = up  - raw;

  if (dDown < dUp)       target = down;       // nearer below
  else if (dUp < dDown)  target = up;         // nearer above
  else                   target = up;         // exact tie → prefer UP

  // ensure progress if rounding lands unchanged
  if (target === totalMg && totalMg > 0) target = Math.max(0, totalMg - step);

  return { target, step };
}
// --- Emphasise Oxycodone vs Naloxone in strength labels (safe HTML) ---
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

// Emphasise only Oxycodone (name + its mg). Naloxone stays normal.
// Safe: escape first, then replace exact escaped substrings once.
function formatOxyOnlyHTML(label){
  if (!label) return "";
  const raw  = String(label);
  let html   = escapeHtml(raw);

  // Replace the first occurrence of an escaped substring, once
  const replaceOnce = (needle, swap) => {
    const idx = html.indexOf(needle);
    if (idx !== -1) {
      html = html.slice(0, idx) + swap + html.slice(idx + needle.length);
    }
  };

  // Case 1: "Oxycodone 30 mg + Naloxone 15 mg …"
  const mPlus = /Oxycodone[^0-9]*\b(\d+(?:\.\d+)?)\s*mg\b/i.exec(raw);
  if (mPlus) {
    const oxyPhrase = raw.match(/Oxycodone[^0-9]*\d+(?:\.\d+)?\s*mg/i)[0];
    const oxyEsc = escapeHtml(oxyPhrase);
    replaceOnce(oxyEsc, `<strong class="oxy-strong">${oxyEsc}</strong>`);
  }

  // Case 2: "Oxycodone/Naloxone 10/5 mg …" → bold the first (oxycodone) value
  if (/Oxycodone/i.test(raw)) {
    const slash1 = /(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)\s*mg/i.exec(raw);
    if (slash1) {
      const firstEsc = escapeHtml(`${slash1[1]} mg`);
      replaceOnce(firstEsc, `<strong class="oxy-strong">${firstEsc}</strong>`);
    } else {
      const slash2 = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*mg/i.exec(raw);
      if (slash2) {
        const firstEsc = escapeHtml(`${slash2[1]} mg`);
        replaceOnce(firstEsc, `<strong class="oxy-strong">${firstEsc}</strong>`);
      }
    }
    // Bold the word "Oxycodone" itself if not already inside <strong>
    const oxyWordEsc = escapeHtml("Oxycodone");
    if (!/<strong[^>]*>\s*Oxycodone\s*<\/strong>/i.test(html)) {
      replaceOnce(oxyWordEsc, `<strong class="oxy-strong">${oxyWordEsc}</strong>`);
    }
  }

  // Soften the form suffix "SR tablet|SR capsule" (do this INSIDE the function)
  html = html.replace(/\b(SR\s*(?:tablet|capsule))\b/ig, '<span class="form-dim">$1</span>');
  return html;
}

function enforceOpioidEndDoseDefault(stepRows){
  try {
    // Guard: wrong shape → no-op
    if (!Array.isArray(stepRows) || !stepRows.length) return stepRows;

    // Read current selections (DOM-based, to match your existing pattern)
    const cls  = document.getElementById("classSelect")?.value || "";
    const med  = document.getElementById("medicineSelect")?.value || "";
    const form = document.getElementById("formSelect")?.value || "";

    // Only apply to Opioid SR/CR
    if (!/Opioid/i.test(cls) || !/(SR|CR)/i.test(form)) return stepRows;

    // --- Tiny utils
    const EPS = 1e-6;
    const num = (v) => (Number.isFinite(+v) ? +v : 0);
    const zeroish = (v) => Math.abs(num(v)) <= EPS;

    // Read helpers if they exist (fallbacks keep things safe)
    const lowestSelected = (typeof isLowestCommercialSelected === "function")
      ? isLowestCommercialSelected(cls, med, form)
      : false;

    // Compute totals for a row (mg at each slot)
    const totalsOf = (row) => ({
      AM:  num(row?.AM),
      MID: num(row?.MID),
      DIN: num(row?.DIN),
      PM:  num(row?.PM),
    });

    // Identify rows that are doses vs meta
    const isMetaRow = (r) => (r?.kind === "STOP" || r?.stop === true || r?.kind === "REVIEW" || r?.review === true);
    const isDoseRow = (r) => !isMetaRow(r) && (num(r?.AM)+num(r?.MID)+num(r?.DIN)+num(r?.PM) > EPS);

    // PM-only detector for a DOSE row
    const isPmOnlyDose = (r) => {
      const t = totalsOf(r);
      return (t.PM > EPS) && zeroish(t.AM + t.MID + t.DIN);
    };

    // Strip any trailing meta rows first so we work on the true last dose
    let out = stepRows.slice();
    while (out.length && isMetaRow(out[out.length-1])) out.pop();
    if (!out.length) return stepRows; // nothing to enforce

    // Find the index of the last DOSE row
    let lastDoseIdx = out.length - 1;
    while (lastDoseIdx >= 0 && !isDoseRow(out[lastDoseIdx])) lastDoseIdx--;
    if (lastDoseIdx < 0) return stepRows; // no dose rows at all

    const lastDose = out[lastDoseIdx];
    const lastDate   = lastDose.date ?? lastDose.dateStr ?? lastDose.applyOn ?? lastDose.applyOnStr ?? "";
    const applyOnStr = lastDose.applyOnStr ?? lastDose.applyOn ?? lastDose.dateStr ?? lastDose.date ?? "";

    // Helper: STOP and REVIEW rows
    const makeStop = () => ({
      kind: "STOP",
      stop: true,
      dateStr: lastDate,
      applyOnStr,
      message: "Stop all doses",
    });
    const makeReview = () => ({
      kind: "REVIEW",
      review: true,
      dateStr: lastDate,
      applyOnStr,
      message: "Review with your doctor the ongoing plan",
    });

    // Look at what currently sits after the last dose row (tail rows that we stripped above)
    // Re-evaluate the true original tail to decide what to add back.
    const originalTail = stepRows.slice(out.length);
    const hadPmOnlyAfterLast =
      originalTail.length && isDoseRow(originalTail[0]) && isPmOnlyDose(originalTail[0]);
    const hadStop = originalTail.some(r => r?.kind === "STOP" || r?.stop === true);
    const hadReview = originalTail.some(r => r?.kind === "REVIEW" || r?.review === true);

    if (lowestSelected) {
      // Lowest strength selected:
      // - Keep the dose rows as-is
      // - If there WAS a PM-only tail, allow it
      // - Always ensure a STOP row exists at the very end
      // Rebuild: [out] + [optional PM-only if it existed] + [STOP]

      // Retain exactly one PM-only dose row if it existed right after the last dose
      const rebuilt = out.slice();
      if (hadPmOnlyAfterLast) rebuilt.push(originalTail[0]);

      // Always ensure a STOP row at end
      rebuilt.push(hadStop ? originalTail.find(r => r?.kind === "STOP" || r?.stop === true) : makeStop());
      return rebuilt;
    } else {
      // Lowest strength NOT selected:
      // - Remove any PM-only and STOP tail rows
      // - Ensure a single REVIEW row exists after the last dose row
      const rebuilt = out.slice();
      if (!hadReview) rebuilt.push(makeReview());
      else rebuilt.push(originalTail.find(r => r?.kind === "REVIEW" || r?.review === true));
      return rebuilt;
    }
  } catch (_err) {
    // Fail safe: never block generation
    return stepRows;
  }
}

function moveReductionRow(row, dir){
  const list = document.getElementById('step1List');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.reduction-row'));
  const i = rows.indexOf(row);
  if (i < 0) return;

  const j = i + dir;
  if (j < 0 || j >= rows.length) return; // already at edge

  // Reinsert DOM node in new position
  if (dir < 0) list.insertBefore(row, rows[j]);            // move up before the row above
  else          list.insertBefore(row, rows[j].nextSibling); // move down after the row below

  refreshThenTags();
  updateRowIndices();
  enforceUniqueTimeSelections();
  disableUpDownButtons();
}

function updateRowIndices(){
  const rows = Array.from(document.querySelectorAll('#step1List .reduction-row'));
  rows.forEach((r, idx) => {
    r.dataset.index = String(idx);
    // keep IDs tidy (not strictly required, but nice)
    const sel = r.querySelector('select[id^="redSlot"]');
    const mg  = r.querySelector('input[id^="redMg"]');
    if (sel) sel.id = `redSlot${idx}`;
    if (mg)  mg.id  = `redMg${idx}`;
  });
}

function disableUpDownButtons(){
  const rows = Array.from(document.querySelectorAll('#step1List .reduction-row'));
  rows.forEach((r, idx) => {
    const up   = r.querySelector('.btn-up');
    const down = r.querySelector('.btn-down');
    if (up)   up.disabled   = (idx === 0);
    if (down) down.disabled = (idx === rows.length - 1);
  });
}

/* =========================================================
   Opioid SR end-dose enforcement (single source of truth)
   - If LOWEST commercial strength is selected:
       allow final PM-only step after a BID step produced by the stepper.
   - If LOWEST commercial strength is NOT selected:
       strip any PM-only final step and insert a REVIEW row at that date.
   ========================================================= */

// Parse "strength" labels like "10 mg", "10/5 mg", etc. → take the first number (the opioid)
function parseMgFromStrength(s){
  if (s == null) return 0;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*mg/i);
  return m ? +m[1] : 0;
}

// Collect all commercial strengths (mg) for current class/med/form from your CATALOG
function allCommercialMg(cls, med, form){
  try{
    const leaf = ((((window.CATALOG||{})[cls]||{})[med]||{})[form]||{});
    return Object.keys(leaf)
      .map(parseMgFromStrength)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a,b)=>a-b);
  } catch(_) { return []; }
}

// Lowest commercial strength (mg) available for this med/form
function lowestCommercialMg(cls, med, form){
  const arr = allCommercialMg(cls, med, form);
  return arr.length ? arr[0] : Infinity;
}

// Current session selection → sorted mg array (empty = “no filters”, i.e. use all)
function selectedProductMgs(){
  if (!window.SelectedFormulations || !(SelectedFormulations instanceof Set) || SelectedFormulations.size === 0) return [];
  return Array.from(SelectedFormulations)
    .map(x => +x)
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a,b)=>a-b);
}

// Is the true commercial MIN selected? (empty selection counts as “yes, all allowed”)
function isLowestCommercialSelected(cls, med, form){
  const low = lowestCommercialMg(cls, med, form);
  const sel = selectedProductMgs();
  return sel.length === 0 || sel.includes(low);
}

// Accepts the flat stepRows array used by renderStandardTable
function applyOpioidEndDoseRule(stepRows){
  try{
    const cls  = document.getElementById("classSelect")?.value || "";
    const med  = document.getElementById("medicineSelect")?.value || "";
    const form = document.getElementById("formSelect")?.value || "";

    // Only for opioid SR tablets/capsules etc. (not patches)
    if (cls !== "Opioid" || !/SR/i.test(form) || /Patch/i.test(form)) return stepRows;

    const lowSelected = isLowestCommercialSelected(cls, med, form);

    // Helper: treat <0.5 mg as zero for screen logic
    const zeroish = v => Math.abs(+v || 0) < 0.5;
    // Helper: pull numeric from possible mkCell objects / strings
    const num = x => +String(x?.value ?? x ?? 0).toString().replace(/[^\d.]/g,"") || 0;

    // Find the last dosing block (ignore trailing STOP/REVIEW rows)
    let i = stepRows.length - 1;
    while (i >= 0 && (stepRows[i].stop || stepRows[i].review)) i--;
    if (i < 0) return stepRows;

    // Group by date for the very last step
    const lastDate = stepRows[i].date || stepRows[i].dateStr || stepRows[i].when || stepRows[i].applyOn || null;
    let j = i;
    const block = [];
    while (j >= 0){
      const d = stepRows[j].date || stepRows[j].dateStr || stepRows[j].when || stepRows[j].applyOn || null;
      if (lastDate && d !== lastDate) break;
      if (!stepRows[j].stop && !stepRows[j].review) block.unshift(stepRows[j]);
      j--;
    }

    // Sum slot totals for that final block
    let AM=0, MID=0, DIN=0, PM=0;
    block.forEach(r=>{
      AM  += num(r.am);
      MID += num(r.mid);
      DIN += num(r.din);
      PM  += num(r.pm);
    });

    const pmOnly = !zeroish(PM) && zeroish(AM + MID + DIN);

    // Case: lowest commercial is NOT selected → do not allow PM-only tail.
    if (pmOnly && !lowSelected){
      const keep = stepRows.slice(0, j+1); // everything before the last block
      keep.push({ review:true, date:lastDate, dateStr:lastDate, message:"Review with your doctor the ongoing plan" });
      return keep;
    }

    // Else (lowest selected) → allow whatever the stepper produced, including PM-only.
    return stepRows;

  } catch(err){
    console.warn("[applyOpioidEndDoseRule] fell back (kept rows):", err);
    return stepRows;
  }
}


/* ===== Custom Mode: Step 1 UI (per-slot mg, 4 rows, reorder, unique slots) ===== */

const MAX_REDUCTION_LINES = 4;

// Class defaults for Step 1 ordering (UI only)
const CLASS_DEFAULT_PRIORITY = {
  opioids:        ['DIN','MID','AM','PM'],
  ppi:            ['MID','PM','AM','DIN'],
  bzd:            null, // hide Mode entirely for BZD
  antipsychotic:  ['MID','DIN','AM','PM'],
  gabapentinoid:  ['DIN','MID','AM','PM'],
};

// Map class from selects
function currentClassKey(){
  const clsSel = document.getElementById('classSelect');
  const medSel = document.getElementById('medicineSelect');
  const clsVal = (clsSel?.value || '').toLowerCase();
  const medVal = (medSel?.value || '').toLowerCase();

  if (clsVal.includes('benz') || clsVal.includes('bzd')) return 'bzd';
  if (clsVal.includes('ppi'))    return 'ppi';
  if (clsVal.includes('antipsych')) return 'antipsychotic';
  if (clsVal.includes('gabapentin') || clsVal.includes('pregabalin')
      || medVal.includes('gabapentin') || medVal.includes('pregabalin')
      || clsVal.includes('gabapentinoid')) return 'gabapentinoid';
  if (clsVal.includes('opioid')) return 'opioids';
  return 'opioids';
}

// Build one reduction row: THEN Reduce [slot] until [mg] mg
function buildReductionRow(idx){
  const row = document.createElement('div');
  row.className = 'reduction-row';
  row.dataset.index = String(idx);

  // left: THEN (only after the first row)
  const left = document.createElement('div');
  left.className = 'row-left';
  if (idx > 0){
    const thenTag = document.createElement('span');
    thenTag.className = 'then-tag';
    thenTag.textContent = 'THEN';
    left.appendChild(thenTag);
  }

  // main: "Reduce [slot] until [mg] mg"
  const main = document.createElement('div');
  main.className = 'row-main';

  const w1 = document.createElement('span'); w1.className='inline-word'; w1.textContent = 'Reduce';

  const slot = document.createElement('select');
  slot.id = `redSlot${idx}`;
  [
    {v:'AM',   label:'in the morning'},
    {v:'MID',  label:'at midday'},
    {v:'DIN',  label:'at dinner'},
    {v:'PM',   label:'at night'},
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v; o.textContent = opt.label;
    slot.appendChild(o);
  });

  const w2 = document.createElement('span'); w2.className='inline-word'; w2.textContent = 'until';

  const mgWrap = document.createElement('div'); mgWrap.className = 'input-suffix';
  const mg = document.createElement('input');
  mg.type = 'number'; mg.min = '0'; mg.placeholder = 'e.g., 50';
  mg.id = `redMg${idx}`;
  const suf = document.createElement('span'); suf.className='suffix'; suf.textContent = 'mg';
  mgWrap.appendChild(mg); mgWrap.appendChild(suf);

  main.appendChild(w1);
  main.appendChild(slot);
  main.appendChild(w2);
  main.appendChild(mgWrap);

  // actions: Up / Down (no Remove)
  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const up = document.createElement('button');
  up.type = 'button'; up.className = 'secondary small btn-up';
  up.textContent = '↑ Up';
  up.addEventListener('click', ()=> moveReductionRow(row, -1));

  const down = document.createElement('button');
  down.type = 'button'; down.className = 'secondary small btn-down';
  down.textContent = '↓ Down';
  down.addEventListener('click', ()=> moveReductionRow(row, +1));

  actions.appendChild(up);
  actions.appendChild(down);

  row.appendChild(left);
  row.appendChild(main);
  row.appendChild(actions);

  // keep uniqueness across rows
  slot.addEventListener('change', enforceUniqueTimeSelections);

  return row;
}

function currentReductionCount(){
  return document.querySelectorAll('#step1List .reduction-row').length;
}

function refreshThenTags(){
  const rows = Array.from(document.querySelectorAll('#step1List .reduction-row'));
  rows.forEach((row, i) => {
    const left = row.querySelector('.row-left');
    if (!left) return;
    left.innerHTML = '';
    if (i > 0){
      const thenTag = document.createElement('span');
      thenTag.className = 'then-tag';
      thenTag.textContent = 'THEN';
      left.appendChild(thenTag);
    }
  });
}

function updateRowIndices(){
  const rows = Array.from(document.querySelectorAll('#step1List .reduction-row'));
  rows.forEach((r, idx) => {
    r.dataset.index = String(idx);
    const sel = r.querySelector('select[id^="redSlot"]');
    const mg  = r.querySelector('input[id^="redMg"]');
    if (sel) sel.id = `redSlot${idx}`;
    if (mg)  mg.id  = `redMg${idx}`;
  });
}

function disableUpDownButtons(){
  const rows = Array.from(document.querySelectorAll('#step1List .reduction-row'));
  rows.forEach((r, idx) => {
    const up   = r.querySelector('.btn-up');
    const down = r.querySelector('.btn-down');
    if (up)   up.disabled   = (idx === 0);
    if (down) down.disabled = (idx === rows.length - 1);
  });
}

function pickFirstAvailableSlot(row){
  const selects = Array.from(document.querySelectorAll('#step1List select[id^="redSlot"]'));
  const used = new Set(selects.filter(s => s !== row.querySelector('select')).map(s => s.value));
  const mySel = row.querySelector('select');
  if (!mySel) return;

  const options = Array.from(mySel.options);
  const preferred = options.find(o => !used.has(o.value));
  if (preferred) mySel.value = preferred.value;
}

function enforceUniqueTimeSelections(){
  const selects = Array.from(document.querySelectorAll('#step1List select[id^="redSlot"]'));
  const used = new Map(); // value -> count
  selects.forEach(sel => used.set(sel.value, (used.get(sel.value)||0)+1));

  selects.forEach(owner => {
    const ownerVal = owner.value;
    Array.from(owner.options).forEach(opt => {
      const val = opt.value;
      const count = used.get(val)||0;
      const chosenElsewhere = (val !== ownerVal && count > 0);
      opt.disabled = chosenElsewhere;
    });
  });
}

function moveReductionRow(row, dir){
  const list = document.getElementById('step1List');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.reduction-row'));
  const i = rows.indexOf(row);
  if (i < 0) return;

  const j = i + dir;
  if (j < 0 || j >= rows.length) return;

  if (dir < 0) list.insertBefore(row, rows[j]);
  else         list.insertBefore(row, rows[j].nextSibling);

  refreshThenTags();
  updateRowIndices();
  enforceUniqueTimeSelections();
  disableUpDownButtons();
}

// Build 4 rows and set class default order
function ensureFourRows(){
  const list = document.getElementById('step1List');
  if (!list) return;
  list.innerHTML = '';
  for (let i=0;i<4;i++){
    const row = buildReductionRow(i);
    list.appendChild(row);
  }
  applyClassDefaultToRows();
  enforceUniqueTimeSelections();
  refreshThenTags();
  disableUpDownButtons();
}

function applyClassDefaultToRows(){
  const key = currentClassKey();
  const def = CLASS_DEFAULT_PRIORITY[key] || ['DIN','MID','AM','PM'];
  const selects = Array.from(document.querySelectorAll('#step1List select[id^="redSlot"]'));
  // Assign in order; any extras keep first available slot
  selects.forEach((sel, idx) => {
    const target = def[idx] || null;
    if (target){
      sel.value = target;
    } else {
      // fall back to first available
      const used = new Set(selects.filter(s => s !== sel).map(s => s.value));
      const opt = Array.from(sel.options).find(o => !used.has(o.value));
      if (opt) sel.value = opt.value;
    }
    enforceUniqueTimeSelections();
  });
}

// Show/hide Step 1 container and build rows when enabled
function syncStep1Enable(){
  const yes = document.getElementById('enableStep1Yes')?.checked;
  const help = document.getElementById('step1Help');
  const list = document.getElementById('step1List');

  const on = !!yes;
  if (help) help.style.display = on ? '' : 'none';
  if (list) list.style.display = on ? '' : 'none';

  if (on && currentReductionCount() === 0){
    ensureFourRows();
  } else if (on){
    // if class changed while on, re-apply class default order
    applyClassDefaultToRows();
    enforceUniqueTimeSelections();
    refreshThenTags();
    disableUpDownButtons();
  }
}

// Wire Step 1 layout
function wireCustomStepsLayout(){
  // Enable Step 1 toggle
  const enNo  = document.getElementById('enableStep1No');
  const enYes = document.getElementById('enableStep1Yes');
  if (enNo)  enNo.addEventListener('change', syncStep1Enable);
  if (enYes) enYes.addEventListener('change', syncStep1Enable);

  // React to class/medicine changes: keep 4 rows & class defaults in sync
  const clsSel = document.getElementById('classSelect');
  const medSel = document.getElementById('medicineSelect');
  const reapply = () => {
    if (document.getElementById('enableStep1Yes')?.checked){
      ensureFourRows();
    }
  };
  if (clsSel) clsSel.addEventListener('change', reapply);
  if (medSel) medSel.addEventListener('change', reapply);

  // Initial state (No)
  syncStep1Enable();
}

function syncModeVisibility(){
  const key = currentClassKey();
  const mode = document.getElementById('modeBlock');
  if (!mode) return;
  mode.style.display = (key === 'bzd') ? 'none' : '';
}
function wireCustomPanel(){
  const clsSel = document.getElementById('classSelect');
  const medSel = document.getElementById('medicineSelect');
  const resetBtn = document.getElementById('resetPriority'); // if you still have it; otherwise ignore

  const onChange = ()=>{ syncModeVisibility(); };
  if (clsSel) clsSel.addEventListener('change', onChange);
  if (medSel) medSel.addEventListener('change', onChange);

  // Initial fill (if you still show Step-1 pills elsewhere, keep your old calls)
  syncModeVisibility();
}

// --- PRINT DECORATIONS (header, colgroup, zebra fallback, nowrap units) ---

//#endregion
//#region 3. Print & PDF Helpers
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

// --- helpers to summarize an array of mg strengths into { mg: count } ---
//#endregion
//#region 4. Dose Distribution Helpers (BID/TDS caps)
function summarizeUnitsArray(arr){
  const m = {};
  for (const mg of arr) m[mg] = (m[mg]||0) + 1;
  return m;
}
function slotUnitsTotal(slotMap){
  return Object.entries(slotMap || {}).reduce((s,[mg,q]) => s + (+mg)*q, 0);
}
function slotCount(slotMap){
  return Object.values(slotMap || {}).reduce((s,q) => s + q, 0);
}

// Keep per-slot count ≤ cap by greedily moving smallest items to the other slot(s)
function enforceSlotCapBID(AM, PM, cap){
  // If both are within cap we're done
  if (slotCount(AM) <= cap && slotCount(PM) <= cap) return;

  // Move smallest from the overflowing slot to the other until both fit or no move possible
  const moveOne = (from, to) => {
    // find smallest mg present in 'from'
    const keys = Object.keys(from).map(Number).sort((a,b)=>a-b);
    for (const mg of keys) {
      if (from[mg] > 0 && slotCount(to) < cap) {
        from[mg]--; if (from[mg]===0) delete from[mg];
        to[mg] = (to[mg]||0) + 1;
        return true;
      }
    }
    return false;
  };

  let guard = 64;
  while (guard-- && (slotCount(AM) > cap || slotCount(PM) > cap)) {
    if (slotCount(AM) > cap && !moveOne(AM, PM)) break;
    if (slotCount(PM) > cap && !moveOne(PM, AM)) break;
  }
}

function enforceSlotCapTDS(AM, MID, PM, cap){
  // Simple loop: push smallest out of any overflowing slot into the currently lightest slot
  const smallestKey = (obj) => {
    const keys = Object.keys(obj).map(Number).filter(k => obj[k] > 0).sort((a,b)=>a-b);
    return keys[0] ?? null;
  };
  const moveOne = (from, to) => {
    const mg = smallestKey(from);
    if (mg == null) return false;
    if (slotCount(to) >= cap) return false;
    from[mg]--; if (from[mg]===0) delete from[mg];
    to[mg] = (to[mg]||0) + 1;
    return true;
  };

  let guard = 96;
  while (guard--) {
    const a = slotCount(AM), m = slotCount(MID), p = slotCount(PM);
    if (a <= cap && m <= cap && p <= cap) break;

    // pick the worst offender
    const entries = [{n:"AM",c:a},{n:"MID",c:m},{n:"PM",c:p}].sort((x,y)=>y.c-x.c);
    const worst = entries[0].n;
    const best  = entries.at(-1).n;

    const src = (worst==="AM"?AM:worst==="MID"?MID:PM);
    const dst = (best==="AM"?AM:best==="MID"?MID:PM);
    if (!moveOne(src, dst)) break;
  }
}

// Pregabalin BID: split as evenly as possible with PM ≥ AM.
// - Place one unit at a time, highest mg first.
// - On ties, prefer PM so PM can be ≥ AM.
// - Respect per-slot unit caps (default 4).
function distributePregabalinBID(unitsArr, perSlotCap) {
  const out = { AM: {}, MID: {}, DIN: {}, PM: {} };
  let mgAM = 0, mgPM = 0;
  let nAM = 0, nPM = 0;

  // Expand to a flat multiset of unit mg, high→low
  const flat = [];
  unitsArr.slice().sort((a,b)=>b.mg - a.mg).forEach(({mg,q}) => {
    for (let i=0;i<q;i++) flat.push(mg);
  });

  const put = (slot, mg) => {
    out[slot][mg] = (out[slot][mg] || 0) + 1;
    if (slot === "AM") { mgAM += mg; nAM++; } else { mgPM += mg; nPM++; }
  };

  for (const mg of flat) {
    // Choose the slot with lower mg total; on ties choose PM.
    let target = (mgAM < mgPM) ? "AM" : (mgAM > mgPM ? "PM" : "PM");

    // Enforce per-slot cap by count of units
    if (target === "AM" && nAM >= perSlotCap) target = "PM";
    if (target === "PM" && nPM >= perSlotCap) target = "AM";

    // If both full (unlikely with cap=4), keep PM bias
    if (target === "AM" && nAM >= perSlotCap && nPM >= perSlotCap) target = "PM";
    if (target === "PM" && nPM >= perSlotCap && nAM >= perSlotCap) target = "AM";

    put(target, mg);
  }

  // Final gentle balance: only move if it improves |AM-PM| and capacity allows.
  const smallestKey = (dict) => {
    const ks = Object.keys(dict); if (!ks.length) return NaN;
    return Math.min(...ks.map(Number));
  };
  while (mgAM > mgPM && nPM < perSlotCap) {
    const mg = smallestKey(out.AM);
    if (!isFinite(mg)) break;
    // If moving this unit doesn't reduce the difference, stop.
    const curDiff = Math.abs(mgAM - mgPM);
    const newDiff = Math.abs((mgAM - mg) - (mgPM + mg));
    if (newDiff >= curDiff) break;

    // Move one smallest AM unit to PM
    out.AM[mg]--; if (out.AM[mg] === 0) delete out.AM[mg];
    mgAM -= mg; nAM--;
    out.PM[mg] = (out.PM[mg] || 0) + 1;
    mgPM += mg; nPM++;
  }

  return out;
}
/* ===== Gabapentinoid helpers (non-destructive additions) ===== */

// Round daily target per medicine class, keeping nudged-down behavior if unchanged.
function roundDailyTargetGabapentinoid(currentTotalMg, percent, med) {
  const step = (med === "Gabapentin") ? 100 : 25; // GABA 100 mg, PREG 25 mg
  const raw = currentTotalMg * (1 - percent/100);
  let target = Math.round(raw / step) * step;
  if (target === currentTotalMg && currentTotalMg > 0) {
    target = Math.max(0, currentTotalMg - step);
  }
  return target;
}

// Infer the user's chosen frequency from the current packs object.
function inferFreqFromPacks(packs) {
  const has = (slot) => {
    const s = packs && packs[slot];
    if (!s) return false;
    // counts by strength (e.g., { "300": 1, "100": 2 })
    return Object.values(s).some(v => (v || 0) > 0);
  };
  const am  = has("AM"), mid = has("MID"), din = has("DIN"), pm  = has("PM");

  if (am && pm && !mid && !din) return "BID";
  if (am && mid && pm && !din)  return "TID";
  if (am && mid && din && pm)   return "QID";
  if (am)  return "AM";
  if (mid) return "MID";
  if (din) return "DIN";
  if (pm)  return "PM";
  return null; // let caller fall back to defaults
}

// Slots count for a given frequency value.
function slotsForFreq(freq){
  switch (freq) {
    case "AM":
    case "MID":
    case "DIN":
    case "PM":
      return 1;
    case "BID":
      return 2;
    case "TID": // preferred
    case "TDS": // legacy spelling
      return 3;
    case "QID":
      return 4;
    default:
      return 2; // safe fallback
  }
}

// Tie-breaker used when picking the best daily total from strength combinations.
function cmpByDosePref(target, A, B) {
  const dA = Math.abs(A.total - target);
  const dB = Math.abs(B.total - target);
  if (dA !== dB) return dA - dB;                // 1) closest to target
  if (A.units !== B.units) return A.units - B.units; // 2) fewer units per day
  const upA = A.total >= target, upB = B.total >= target;
  if (upA !== upB) return upA ? -1 : 1;         // 3) prefer rounding up (avoid underdose)
  const maxA = A.strengths.length ? Math.max(...A.strengths) : 0;
  const maxB = B.strengths.length ? Math.max(...B.strengths) : 0;
  if (maxA !== maxB) return maxB - maxA;        // 4) prefer higher single strengths
  return 0;
}

// Choose the best achievable daily total by enumerating combinations under a per-slot cap.
function selectBestOralTotal(target, strengths, freq, unitCapPerSlot = 4) {
  const maxSlots = slotsForFreq(freq);
  const maxUnitsPerDay = Math.max(1, maxSlots * unitCapPerSlot);
  const S = strengths.slice().sort((a,b)=>b-a); // try higher strengths first
  let best = null;

  function dfs(i, unitsUsed, totalMg, counts) {
    if (unitsUsed > maxUnitsPerDay) return;
    if (i === S.length) {
      if (unitsUsed === 0) return;
      const flat = [];
      S.forEach((mg, idx) => { for (let k=0;k<(counts[idx]||0);k++) flat.push(mg); });
      const cand = {
        total: totalMg,
        units: unitsUsed,
        strengths: flat,
        byStrength: new Map(S.map((mg, idx)=>[mg, counts[idx]||0]))
      };
      if (!best || cmpByDosePref(target, cand, best) < 0) best = cand;
      return;
    }
    const mg = S[i];
    const remain = maxUnitsPerDay - unitsUsed;
    for (let c = remain; c >= 0; c--) {
      counts[i] = c;
      dfs(i+1, unitsUsed + c, totalMg + c*mg, counts);
    }
    counts[i] = 0;
  }

  dfs(0, 0, 0, []);
  return best;
}

// QID: simple equal-ish distribution with remainder order AM -> MID -> DIN -> PM.
// (We can refine to "reduce DIN first" when we have previous-step context if you want.)
function distributeEvenQID(unitsArr, perSlotCap) {
  const slots = { AM:{}, MID:{}, DIN:{}, PM:{} };
  const put = (slot, mg) => {
    const cur = slots[slot][mg] || 0;
    if (Object.values(slots[slot]).reduce((a,b)=>a+b,0) >= perSlotCap) return false;
    slots[slot][mg] = cur + 1;
    return true;
  };
  // Expand units into a flat array like [300,300,75,25,...] (higher first)
  const flat = [];
  unitsArr.sort((a,b)=>b.mg - a.mg).forEach(({mg,q})=>{ for(let i=0;i<q;i++) flat.push(mg); });

  // Round-robin distribute with priority order AM -> MID -> DIN -> PM
  const order = ["AM","MID","DIN","PM"];
  let idx = 0;
  for (const mg of flat) {
    // Try to place; if slot full, try next slot in order
    for (let t=0; t<order.length; t++) {
      const slot = order[(idx + t) % order.length];
      if (put(slot, mg)) { idx = (idx + 1) % order.length; break; }
    }
  }
  return slots;
}

// Gabapentin TID: centre-light pattern.
// - Keep AM and PM as equal as possible.
// - MID should be ≤ min(AM, PM). If there's a remainder, PM can be ≥ AM.
// - Avoid "wiping" AM or MID via over-aggressive nudges.
// - Respect per-slot unit caps (default 4).
// Gabapentin TID: centre-light split with PM allowed to hold the remainder.
// Targets per day: AM ≈ PM, MID <= min(AM, PM), PM can be heavier if needed.
// Greedy placement toward slot targets, then tiny balancing nudges.
// Respects per-slot cap (default 4 units).
function distributeGabapentinTDS(unitsArr, perSlotCap) {
  const out = { AM: {}, MID: {}, DIN: {}, PM: {} };
  let mgAM = 0, mgMID = 0, mgPM = 0;
  let nAM  = 0, nMID  = 0, nPM  = 0;

  // Flatten unit list high→low mg (e.g., [800, 600, 400, 400, ...])
  const flat = [];
  unitsArr.slice().sort((a,b)=>b.mg - a.mg).forEach(({mg,q}) => { for (let i=0;i<q;i++) flat.push(mg); });

  // Compute daily target and ideal slot targets (PM gets the remainder)
  const totalMg = flat.reduce((s,m)=>s+m,0);
  const base = Math.floor(totalMg / 3);
  const remainder = totalMg - base*3; // 0,1,2
  const tAM  = base;
  const tMID = base;
  const tPM  = base + remainder; // PM may carry the +1 or +2 remainder

  const capOK = (slot) =>
    (slot==="AM"  && nAM  < perSlotCap) ||
    (slot==="MID" && nMID < perSlotCap) ||
    (slot==="PM"  && nPM  < perSlotCap);

  const put = (slot, mg) => {
    out[slot][mg] = (out[slot][mg] || 0) + 1;
    if (slot==="AM")  { mgAM  += mg; nAM++;  }
    if (slot==="MID") { mgMID += mg; nMID++; }
    if (slot==="PM")  { mgPM  += mg; nPM++;  }
  };

  // Helper: deficit (how far below target we'd be *after* placing this mg)
  function deficitAfter(slot, mg) {
    if (slot === "AM")  return (tAM  - (mgAM  + mg));
    if (slot === "MID") return (tMID - (mgMID + mg));
    return (tPM - (mgPM + mg)); // PM
  }

  for (const mg of flat) {
    // Candidate slots in priority order: PM > AM > MID
    // (prefer to keep MID light; remainder allowed in PM)
    const candidates = ["PM", "AM", "MID"].filter(capOK);

    // Filter out any candidate where placing into MID would break centre-light rule
    const feasible = candidates.filter(slot => {
      if (slot !== "MID") return true;
      // Placing into MID must not make MID exceed min(AM, PM)
      return (mgMID + mg) <= Math.min(mgAM, mgPM);
    });

    // Pick slot that reduces the biggest shortfall to its target (largest positive deficit)
    let best = null, bestDef = -Infinity;
    for (const slot of (feasible.length ? feasible : candidates)) {
      let def = deficitAfter(slot, mg);
      // Prefer positive (still below target). If all negative, pick the least overshoot.
      if (def > bestDef || (def === bestDef && (slot==="PM" || (best!=="PM" && slot==="AM")))) {
        bestDef = def; best = slot;
      }
    }

    // Fallback if somehow none chosen (shouldn't happen)
    if (!best) best = candidates[0] || "PM";
    put(best, mg);
  }

  // ---- Gentle balancing nudges ----
  const smallestKey = (dict) => {
    const ks = Object.keys(dict);
    return ks.length ? Math.min(...ks.map(Number)) : NaN;
  };
  function moveOne(from, to) {
    const k = smallestKey(out[from]); if (!isFinite(k)) return false;
    if (to==="AM"  && nAM  >= perSlotCap) return false;
    if (to==="MID" && nMID >= perSlotCap) return false;
    if (to==="PM"  && nPM  >= perSlotCap) return false;

    // Check centre-light rule if moving into MID
    if (to === "MID" && (mgMID + k) > Math.min(mgAM, mgPM)) return false;

    // Only move if |AM-PM| improves (or keeps centre-light intact)
    const curAP = Math.abs(mgAM - mgPM);
    const fromAfter = (from==="AM"? mgAM : from==="MID"? mgMID : mgPM) - k;
    const toAfter   = (to  ==="AM"? mgAM : to  ==="MID"? mgMID : mgPM) + k;
    // Predict new AM/PM totals
    const pAM  = from==="AM"  ? fromAfter : (to==="AM"  ? toAfter : mgAM);
    const pPM  = from==="PM"  ? fromAfter : (to==="PM"  ? toAfter : mgPM);
    const newAP = Math.abs(pAM - pPM);
    if (newAP > curAP) return false;

    // Apply move
    out[from][k]--; if (out[from][k] === 0) delete out[from][k];
    if (from==="AM")  { mgAM  -= k; nAM--;  }
    if (from==="MID") { mgMID -= k; nMID--; }
    if (from==="PM")  { mgPM  -= k; nPM--;  }

    out[to][k] = (out[to][k] || 0) + 1;
    if (to==="AM")  { mgAM  += k; nAM++;  }
    if (to==="MID") { mgMID += k; nMID++; }
    if (to==="PM")  { mgPM  += k; nPM++;  }
    return true;
  }

  // Nudge AM/PM toward equality if a single smallest-unit move helps
  while (mgAM > mgPM && moveOne("AM", "PM")) {/* improve */}
  while (mgPM > mgAM && moveOne("PM", "AM")) {/* improve */}

  // Ensure MID ≤ min(AM, PM) — if MID creeps above, move one smallest to the lighter of AM/PM
  while (mgMID > Math.min(mgAM, mgPM)) {
    const to = (mgAM <= mgPM) ? "AM" : "PM";
    if (!moveOne("MID", to)) break;
  }

  return out;
}
// ---------- Product picker state (session-only) ----------
const PRODUCT_SELECTION = Object.create(null); // key: `${class}|${med}` -> Set of "Form::mg"

// Which medicines/forms show a picker
const PRODUCT_PICKER_ALLOW = {
  "Morphine":            ["Slow Release Tablet","SR Tablet","CR Tablet"],
  "Oxycodone":           ["Slow Release Tablet","SR Tablet","CR Tablet"],
  "Oxycodone/Naloxone":  ["Slow Release Tablet","SR Tablet","CR Tablet"],
  "Tapentadol":          ["Slow Release Tablet","SR Tablet","CR Tablet"],
  "Tramadol":            ["Slow Release Tablet","SR Tablet","CR Tablet"],
  "Gabapentin":          ["Capsule","Tablet","Tablet/Capsule"],
  "Pregabalin":          ["Capsule"]
};

const currentKey = () => {
  const cls = document.getElementById("classSelect")?.value || "";
  const med = document.getElementById("medicineSelect")?.value || "";
  return `${cls}|${med}`;
};

const isPickerEligible = () => {
  const med = document.getElementById("medicineSelect")?.value || "";
  return !!PRODUCT_PICKER_ALLOW[med];
};

// Gabapentin: strength uniquely implies form
// Map gabapentin strength → form (never guess "Capsule" for 600/800)
function gabapentinFormForMg(mg){
  mg = +mg;
  if (mg === 600 || mg === 800) return "Tablet";
  if (mg === 100 || mg === 300 || mg === 400) return "Capsule";
  return "Capsule";
}


// Build the list of commercial products (form + strength) for the selected medicine
function allCommercialProductsForSelected(){
  const cls = document.getElementById("classSelect")?.value || "";
  const med = document.getElementById("medicineSelect")?.value || "";
  const allow = PRODUCT_PICKER_ALLOW[med] || [];
  const cat = (window.CATALOG?.[cls]?.[med]) || {}; // { form: [mg,...] }

  const list = [];
  for (const [formLabel, strengths] of Object.entries(cat)){
    // allow only specific forms per medicine
    const ok = allow.some(a => formLabel.toLowerCase().includes(a.toLowerCase()));
    if (!ok) continue;

    strengths.forEach(mg => {
      let f = formLabel;
      if (/Gabapentin/i.test(med) && /Tablet\s*\/\s*Capsule/i.test(formLabel)) {
        f = gabapentinFormForMg(mg);
      }
      list.push({ form: f, mg: +mg });
    });
  }
  // de-dup (in case mapping produced duplicates)
  const seen = new Set(), dedup = [];
  for (const p of list){
    const k = `${p.form}::${p.mg}`;
    if (!seen.has(k)) { seen.add(k); dedup.push(p); }
  }
  // Sort by form then mg
  dedup.sort((a,b)=> (a.form.localeCompare(b.form) || (a.mg - b.mg)));
  return dedup;
}

// Read current selection (returns array of mg if any selected, else null -> use default)
// Return allowed mg strengths for the CURRENT class/med/form.
// None ticked => treat as "all products allowed".

function strengthsForSelectedSafe(cls, med, form){
  try {
    if (typeof strengthsForSelected === "function") {
      return strengthsForSelected().map(parseMgFromStrength).filter(v => v > 0);
    }
    // Fallback to CATALOG if needed
    const cat = (window.CATALOG?.[cls]?.[med]) || {};
    const arr = (cat && (cat[form] || Object.values(cat).flat())) || [];
    return arr.map(parseMgFromStrength).filter(v => v > 0);
  } catch (_) {
    return [];
  }
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
// Save PDF uses the browser's Print dialog; choose "Save as PDF"
function saveOutputAsPdf() {
//#endregion
//#region 8. UI State, Dirty Flags, Toasts
  showToast('In the dialog, choose "Save as PDF".');
  printOutputOnly();
}

// --- Suggested practice copy (exact wording from your doc) ---
//#endregion
//#region 7. Suggested Practice & Footers
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

  gabapentinoids: `• Reduce X% every Y weeks with close monitoring
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,
  
  ppi: `• Step-down to lowest effective dose, alternate-day dosing, or stop and use on-demand.
• Review at 4–12 weeks.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE]   [INSERT GUIDE TO RULESET]`,
};

// ---- Class-specific footer copy (placeholder text) ----
const CLASS_FOOTER_COPY = {
  opioids:       "Insert specific footer + disclaimer for Opioids",
  bzra:          "Insert specific footer + disclaimer for Benzodiazepines / Z Drugs (BZRA)",
  antipsychotic: "Insert specific footer + disclaimer for Antipsychotics",
  ppi:           "Insert specific footer + disclaimer for Proton Pump Inhibitors",
  gabapentinoids: "Insert specific footer + disclaimer for Gabapentinoids",
  _default:      ""
};

// Map the visible class label to a key in CLASS_FOOTER_COPY
function mapClassToKey(label){
  const s = String(label || "").toLowerCase();
  if (s.includes("benzodiazep")) return "bzra";
  if (s.includes("z-drug") || s.includes("z drug")) return "bzra";
  if (s.includes("antipsych")) return "antipsychotic";
  if (s.includes("proton") || s.includes("ppi")) return "ppi";
  if (s.includes("opioid") || s.includes("fentanyl") || s.includes("buprenorphine")) return "opioids";
  if (s.includes("gaba") || s.includes("gabapentin") || s.includes("pregabalin")) return "gabapentinoids";
  return null;
}

// Normalize a visible label to one of our keys above
function footerKeyFromLabel(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("opioid") || s.includes("fentanyl") || s.includes("buprenorphine")) return "opiods" || "opioids";
  if (s.includes("benzodiazep") || s.includes("z-drug") || s.includes("z drug")) return "bzra";
  if (s.includes("antipsych")) return "antipsychotic";
  if (s.includes("proton") || s.includes("ppi")) return "ppi";
  if (s.includes("gaba") || s.includes("gabapentin") || s.includes("pregabalin")) return "gabapentinoids";
  return null;
}

function updateClassFooter() {
  const cls = document.getElementById("classSelect")?.value || "";
  const key = mapClassToKey(cls);                     // "opioids" | "bzra" | "antipsychotic" | "ppi" | null
  const text = (key && CLASS_FOOTER_COPY[key]) || CLASS_FOOTER_COPY._default;
  const target = document.getElementById("classFooter");
  if (target) target.textContent = text;
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
  gabapentinoids: "Gabapentinoids"
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
/* ------------------------------------------------------------------
   Safety rules: spread check + friendly confirm
   - Computes per-step slot totals (AM/MID/DIN/PM) in mg
   - Warns if spread > medicine-specific limit
   - One-time grace when a slot first retires to 0
------------------------------------------------------------------ */

// 1) Medicine-specific spread limits (mg)
const SPREAD_LIMITS = {
  morphine: 30,
  oxycodone: 20,
  "oxycodone-naloxone": 20,
  tapentadol: 100,
  tramadol: 100,
  gabapentin: 300,
  pregabalin: 75,    // per your update
};

// 2) Recognise medicine from the strength label text
function spreadKeyFromLabel(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("oxycodone") && s.includes("naloxone")) return "oxycodone-naloxone";
  if (s.includes("oxycodone")) return "oxycodone";
  if (s.includes("morphine")) return "morphine";
  if (s.includes("tapentadol")) return "tapentadol";
  if (s.includes("tramadol")) return "tramadol";
  if (s.includes("gabapentin")) return "gabapentin";
  if (s.includes("pregabalin")) return "pregabalin";
  return null;
}

// 3) Extract the primary mg value for a line's strength label
//    - For oxy/nal combos, returns the OXYCODONE mg (first number)
function extractPrimaryMg(label) {
  const raw = String(label || "");
  // "Oxycodone ... 10 mg + Naloxone 5 mg ..."
  let m = /Oxycodone[^0-9]*([\d.]+)\s*mg/i.exec(raw);
  if (m) return parseFloat(m[1]);

  // "Oxycodone/Naloxone 10/5 mg ..."
  m = /Oxycodone\/Naloxone\s+([\d.]+)\s*\/\s*([\d.]+)\s*mg/i.exec(raw);
  if (m) return parseFloat(m[1]);

  // Generic "123 mg" (first number before mg)
  m = /([\d.]+)\s*mg/i.exec(raw);
  return m ? parseFloat(m[1]) : 0;
}

// 4) Compute per-slot totals (mg) for a single step
function slotTotalsMg(step) {
  const totals = { AM: 0, MID: 0, DIN: 0, PM: 0 };
  const lines = step?.lines || step?.rows || []; // be tolerant to naming
  for (const line of lines) {
    const mg = extractPrimaryMg(line.strength || line.strengthLabel || "");
    const am  = (line.morning ?? line.am  ?? 0) * mg;
    const mid = (line.midday  ?? line.mid ?? 0) * mg;
    const din = (line.dinner  ?? line.din ?? 0) * mg;
    const pm  = (line.night   ?? line.pm  ?? line.nocte ?? 0) * mg;
    totals.AM  += am; totals.MID += mid; totals.DIN += din; totals.PM  += pm;
  }
  return totals;
}

// 5) First non-null medicine key seen in a step (from its lines)
function discoverSpreadKey(step) {
  const lines = step?.lines || step?.rows || [];
  for (const line of lines) {
    const key = spreadKeyFromLabel(line.strength || line.strengthLabel || "");
    if (key) return key;
  }
  return null;
}

// 6) Spread (max - min) among ACTIVE slots (dose > 0)
function computeSpread(totals) {
  const vals = [totals.AM, totals.MID, totals.DIN, totals.PM].filter(v => v > 0.0001);
  if (vals.length <= 1) return 0; // one or zero active slots → spread is 0
  const maxv = Math.max(...vals), minv = Math.min(...vals);
  return maxv - minv;
}

// 7) Friendly summary for the confirm message
function formatSlotSummary(t) {
  const fmt = v => (Math.round(v*10)/10).toLocaleString();
  return `AM ${fmt(t.AM)} mg • MID ${fmt(t.MID)} mg • DIN ${fmt(t.DIN)} mg • PM ${fmt(t.PM)} mg`;
}

// 8) The interactive pre-scan (returns pruned plan or null to abort)
function applySpreadSafetyInteractive(stepRows) {
  if (!Array.isArray(stepRows) || !stepRows.length) return stepRows;

  let prevActiveCount = null;
  let usedGraceOnRetire = false;  // allow grace once (when a slot first retires)
  // Work out medicine key & limit from the first step that has a label
  let spreadKey = null, limit = null;

  for (let i = 0; i < stepRows.length; i++) {
    const step = stepRows[i];
    // Skip non-dose steps (STOP/REVIEW rows)
    if (step?.kind && step.kind !== "DOSE") continue;

    if (!spreadKey) {
      spreadKey = discoverSpreadKey(step);
      limit = spreadKey ? SPREAD_LIMITS[spreadKey] : null;
    }
    if (!limit) continue; // unknown class → no spread check

    const totals = slotTotalsMg(step);
    const activeCount = ["AM","MID","DIN","PM"].reduce((n,k)=> n + (totals[k] > 0.0001 ? 1 : 0), 0);

    // Retirement grace: if a slot has just dropped to 0 for the first time, allow this step once
    const justRetired = (prevActiveCount !== null && activeCount < prevActiveCount && !usedGraceOnRetire);
    if (justRetired) {
      usedGraceOnRetire = true;
      prevActiveCount = activeCount;
      continue; // allow without warning
    }

    const spread = computeSpread(totals);
    if (spread > limit) {
      const msg = [
        `Heads-up: this step would produce an uneven split for ${spreadKey.replace("-"," / ")}.`,
        `Allowed difference: ≤ ${limit} mg.`,
        `This step: ${formatSlotSummary(totals)} (spread ${Math.round(spread)} mg).`,
        ``,
        `For safety and due to calculator limits, do you want to continue?`,
      ].join("\n");

      if (!window.confirm(msg)) {
        // User chose "Stop for review": trim plan to previous steps and add a REVIEW row
        const dateStr = step.dateStr || step.date || step.when || step.applyOn || "";
        const reviewRow = { kind: "REVIEW", dateStr, message: "Review with your doctor the ongoing plan" };
        // Keep steps BEFORE this one, then insert review
        const pruned = stepRows.slice(0, i);
        pruned.push(reviewRow);
        return pruned;
      }
      // else: user chose Continue → permit this step and keep scanning
    }

    prevActiveCount = activeCount;
  }

  return stepRows;
}
// --- End-dose helpers for Opioid SR ---
function lowestCommercialMg(cls, med, form){
  try{
    // Use your safe strength list (already filtered by med/form)
    const list = (typeof strengthsForSelectedSafe === "function")
      ? strengthsForSelectedSafe(cls, med, form)
      : (typeof strengthsForPicker === "function" ? strengthsForPicker() : []);
    const mg = (list||[])
      .map(v => (typeof parseMgFromStrength === "function" ? parseMgFromStrength(v) : parseFloat(String(v))))
      .filter(v => Number.isFinite(v) && v > 0)
      .sort((a,b)=>a-b);
    return mg[0] || 0;
  } catch(_) { return 0; }
}

function slotTotalsOfRow(row){
  const packs = row?.packs || {};
  const tot = (slot) => (packs[slot] ? packsTotalMg({[slot]: packs[slot]}) : 0);
  return { AM: tot("AM"), MID: tot("MID"), DIN: tot("DIN"), PM: tot("PM") };
}

function isBidAtLowest(row, minMg){
  const t = slotTotalsOfRow(row);
  const near = (a,b)=> Math.abs((a||0)-(b||0)) <= (typeof EPS==='number'?EPS:1e-6);
  return near(t.AM, minMg) && near(t.PM, minMg) && (t.MID <= (EPS||1e-6)) && (t.DIN <= (EPS||1e-6));
}

function isPmOnly(row){
  const t = slotTotalsOfRow(row);
  return t.PM > (EPS||1e-6) && (t.AM + t.MID + t.DIN) <= (EPS||1e-6);
}

/**
 * Enforce opioid SR end-dose rule:
 * - lowest selected:   BID@lowest → PM-only → STOP
 * - lowest not selected: BID@lowest → REVIEW   (no PM-only)
 */
function enforceOpioidEndDoseTail(stepRows){
  try{
    if (!Array.isArray(stepRows) || !stepRows.length) return stepRows;

    // Determine cls/med/form from controls (prefer) or last row
    const cls = document.getElementById("classSelect")?.value || stepRows[stepRows.length-1]?.cls || "";
    const med = document.getElementById("medicineSelect")?.value || stepRows[stepRows.length-1]?.med || "";
    const form= document.getElementById("formSelect")?.value || stepRows[stepRows.length-1]?.form|| "";

    if (cls !== "Opioid" || !/SR/i.test(form)) return stepRows;

    const minMg = lowestCommercialMg(cls, med, form);
    if (!minMg) return stepRows;

    const lowestAllowed = isLowestCommercialSelected(cls, med, form);

    // Work on a shallow copy and peel off trailing STOP/REVIEW for inspection
    const out = stepRows.slice();
    const tail = [];
    while (out.length && (out[out.length-1]?.stop || out[out.length-1]?.review || out[out.length-1]?.kind === "STOP" || out[out.length-1]?.kind === "REVIEW")){
      tail.unshift(out.pop());
    }

    if (!out.length) return stepRows;

    // Find the last DOSE row that is BID at lowest
    let k = -1;
    for (let i = out.length-1; i >= 0; i--){
      const r = out[i];
      if (r && !r.stop && !r.review && r.kind !== "STOP" && r.kind !== "REVIEW"){
        if (isBidAtLowest(r, minMg)){ k = i; break; }
      }
    }
    if (k === -1){
      // No BID@lowest found; restore original tail and return
      return out.concat(tail);
    }

    // Check if we already have a PM-only row right after that BID row
    const hadPmOnly = (out[k+1] && !out[k+1].stop && !out[k+1].review && isPmOnly(out[k+1]));

    // Decide target tail by rule
    if (lowestAllowed){
      // Ensure PM-only then STOP exists
      if (!hadPmOnly){
        // Build a PM-only packs by copying PM from the BID row
        const bidRow = out[k];
        const pmPacks = (bidRow.packs && bidRow.packs.PM) ? deepCopy(bidRow.packs.PM) : [];
        const packsPmOnly = { AM:[], MID:[], DIN:[], PM: pmPacks };

        // Choose a date: use the first tail date if present, else repeat BID date
        const pmDate = (tail.length && tail[0]?.date) ? tail[0].date : bidRow.date;
        const pmWeek = (typeof bidRow.week === "number") ? (bidRow.week + 1) : undefined;

        out.splice(k+1, 0, {
          week: pmWeek,
          date: pmDate,
          packs: packsPmOnly,
          med: bidRow.med, form: bidRow.form, cls: bidRow.cls
        });
      }
      // Ensure STOP after PM-only (keep existing STOP from tail if present, else add one)
      let hasStop = tail.some(t => t.stop || t.kind === "STOP");
      const stopDate = (tail.find(t => t.stop || t.kind === "STOP")?.date)
                    || (out[k+1]?.date) || (out[k]?.date);
      if (!hasStop){
        out.push({ week: (out[k+1]?.week ? out[k+1].week+1 : undefined),
                   date: stopDate, packs:{}, med: out[k].med, form: out[k].form, cls: out[k].cls, stop:true });
      } else {
        // put back the original STOP (and drop any REVIEW from the tail for this rule)
        const keep = tail.filter(t => t.stop || t.kind === "STOP");
        out.push(...keep);
      }
    } else {
      // Lowest NOT allowed: ensure NO PM-only and end with REVIEW
      // Drop any PM-only right after BID
      if (hadPmOnly) out.splice(k+1, 1);

      // End with REVIEW (use first tail date if present, else BID date)
      const rvwDate = (tail.length && tail[0]?.date) ? tail[0].date : out[k].date;
      out.push({ date: rvwDate, med: out[k].med, form: out[k].form, cls: out[k].cls,
                 kind:"REVIEW", review:true, message:"Review with your doctor the ongoing plan" });
    }

    return out;
  } catch(_){
    return stepRows;
  }
}

/* ==========================================
   RENDER STANDARD (tablets/caps/ODT) TABLE
   - Merges date per step (rowspan)
   - Zebra per step-group (CSS)
   - Stop/Review merged cell after date
   ========================================== */

//#endregion
//#region 5. Renderers (Standard & Patch)
function renderStandardTable(stepRows){
  stepRows = applyOpioidEndDoseRule(stepRows);
  stepRows = enforceOpioidEndDoseTail(stepRows);
  stepRows = enforceOpioidEndDoseDefault(stepRows); 
  stepRows = applySpreadSafetyInteractive(stepRows);
  if (!stepRows) return;
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

// [2] Strength — emphasise oxycodone over naloxone on ALL rows
const tdStrength = document.createElement("td");
tdStrength.className = "col-strength";
tdStrength.innerHTML = formatOxyOnlyHTML(line.strength || "");
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
/* ======================Global Tiebreaker Rules================
// --- tie-breaker for non-patch combos ---
// A and B: { total:number, units:number, strengths:number[] }
// strengths = flattened list of unit strengths, e.g. [150,75,25,25]

/* ====================== Global Tiebreak + selector (used for oral classes) ====================== */

function cmpByDosePref(target, A, B) {
  const dA = Math.abs(A.total - target);
  const dB = Math.abs(B.total - target);
  if (dA !== dB) return dA - dB;                  // 1) closest total to target
  if (A.units !== B.units) return A.units - B.units; // 2) fewer units per day
  const upA = A.total >= target, upB = B.total >= target;
  if (upA !== upB) return upA ? -1 : 1;           // 3) prefer rounding up
  const maxA = A.strengths.length ? Math.max(...A.strengths) : 0;
  const maxB = B.strengths.length ? Math.max(...B.strengths) : 0;
  if (maxA !== maxB) return maxB - maxA;          // 4) prefer higher single strengths
  return 0;
}

function slotsForFreq(freq){
  switch (freq) {
    case "AM": case "MID": case "DIN": case "PM": return 1;
    case "BID": return 2;
    case "TID": // clinical display
    case "TDS": return 3; // legacy synonym
    case "QID": return 4;
    default:    return 2;
  }
}

// Enumerate achievable daily totals under per-slot caps; choose best per cmpByDosePref
function selectBestOralTotal(target, strengths, freq, unitCapPerSlot = 4) {
  const maxSlots = slotsForFreq(freq);
  const maxUnitsPerDay = Math.max(1, maxSlots * unitCapPerSlot);
  const S = strengths.slice().sort((a,b)=>b-a);
  let best = null;

  function dfs(i, unitsUsed, totalMg, counts) {
    if (unitsUsed > maxUnitsPerDay) return;
    if (i === S.length) {
      if (unitsUsed === 0) return;
      const flat = [];
      S.forEach((mg, idx) => { for (let k=0;k<(counts[idx]||0);k++) flat.push(mg); });
      const cand = { total: totalMg, units: unitsUsed, strengths: flat,
                     byStrength: new Map(S.map((mg, idx)=>[mg, counts[idx]||0])) };
      if (!best || cmpByDosePref(target, cand, best) < 0) best = cand;
      return;
    }
    const mg = S[i];
    const maxThis = Math.min(maxUnitsPerDay - unitsUsed, maxUnitsPerDay);
    for (let c = maxThis; c >= 0; c--) {
      counts[i] = c;
      dfs(i+1, unitsUsed + c, totalMg + c*mg, counts);
    }
    counts[i] = 0;
  }

  dfs(0, 0, 0, []);
  return best;
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

//#endregion
//#region 6. Catalogue (commercial strengths) & Label Helpers
const CLASS_ORDER = ["Opioid","Benzodiazepines / Z-Drug (BZRA)","Antipsychotic","Proton Pump Inhibitor","Gabapentinoids"];

const CATALOG = {
  Opioid: {
    Morphine: { "SR Tablet": ["5 mg","10 mg","15 mg","30 mg","60 mg","100 mg","200 mg"] },
    Oxycodone: { "SR Tablet": ["5 mg","10 mg","15 mg","20 mg","30 mg","40 mg","80 mg"] },
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
  "Gabapentinoids": {
    Pregabalin: {"Capsule": [25, 75, 150, 300] },
    Gabapentin: {"Tablet/Capsule": [100, 300, 400, 600, 800]},
  }
  };

// Gabapentin: map strength -> dose form when using the combined "Tablet/Capsule"
const GABA_FORM_BY_STRENGTH = { 100: "Capsule", 300: "Capsule", 400: "Capsule", 600: "Tablet", 800: "Tablet" };

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
const ANTIPSYCHOTIC_MODE = "Show";

function populateClasses() {
  const el = $("classSelect");
  if (!el) return;
  el.innerHTML = "";

  CLASS_ORDER.forEach(c => {
    // only add classes that exist in the catalog
    if (!CATALOG[c]) return;

    // handle Antipsychotic visibility/enable state
    if (c === "Antipsychotic") {
      if (ANTIPSYCHOTIC_MODE === "hide") return; // skip entirely

      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      if (ANTIPSYCHOTIC_MODE === "disable") {
        o.disabled = true; // visible but cannot be chosen
      }
      el.appendChild(o);
      return;
    }

    // normal classes
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    el.appendChild(o);
  });

  // Safety: if the current value is Antipsychotic while muted, bump to first available
  if ((el.value === "Antipsychotic" && ANTIPSYCHOTIC_MODE !== "show") || !el.value) {
    el.selectedIndex = 0;
  }
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
  if (cls === "Gabapentinoids") return { half:false, quarter:false };
  return {half:true, quarter:true};
}

/* default frequency */
function defaultFreq(){
  const cls = $("classSelect")?.value;
  const form = $("formSelect")?.value;
  const med = $("medicineSelect")?.value;

  if (form === "Patch") return "PATCH";
  if (cls === "Benzodiazepines / Z-Drug (BZRA)") return "PM";
  if (cls === "Proton Pump Inhibitor") return "DIN";
  if (cls === "Gabapentinoids") {
    if (med === "Gabapentin")  return "TID";
    if (med === "Pregabalin")  return "BID";
    return "BID";
  }
  if (cls === "Opioid" || cls === "Antipsychotic") return "BID";
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

    // Decide noun from med/form/strength
    const initialStrength = ln.strengthStr || "";
    const noun = nounForGabapentinByStrength(form, med, initialStrength);

    row.innerHTML = `
      <span class="badge">Line ${idx+1}</span>
      <span>Strength:</span><select class="dl-strength" data-id="${ln.id}"></select>
      <span class="dl-noun">Number of ${noun}:</span><input class="dl-qty" data-id="${ln.id}" type="number" />
      <span>Frequency:</span><select class="dl-freq" data-id="${ln.id}"></select>
      <button type="button" class="secondary dl-remove" data-id="${ln.id}">Remove</button>`;
    box.appendChild(row);

    const sSel=row.querySelector(".dl-strength");
    const sList=strengthsForSelected().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
    sSel.innerHTML=""; sList.forEach(s=>{ const o=document.createElement("option"); o.value=s; o.textContent=s; sSel.appendChild(o); });
    sSel.value=ln.strengthStr || sList[0];

const nounSpan = row.querySelector(".dl-noun");

sSel.onchange = (e) => {
  const id = +e.target.dataset.id;
  const l = doseLines.find(x=>x.id===id);
  if (l) l.strengthStr = e.target.value;

  // live-update the noun text per selected strength
  const newNoun = nounForGabapentinByStrength(form, med, e.target.value);
  if (nounSpan) nounSpan.textContent = `Number of ${newNoun}:`;

  setDirty(true);
};    
    const fSel=row.querySelector(".dl-freq"); fSel.innerHTML="";
    if(/Patch/i.test(form)){
      const o=document.createElement("option"); o.value="PATCH"; o.textContent=($("medicineSelect").value==="Fentanyl")?"Every 3 days":"Every 7 days";
      fSel.appendChild(o); fSel.disabled=true;
    } else if(cls==="Benzodiazepines / Z-Drug (BZRA)"){
      const o=document.createElement("option"); o.value="PM"; o.textContent="Daily at night";
      fSel.appendChild(o); fSel.disabled=true;
    } else if(cls==="Opioid" || cls==="Antipsychotic" || cls==="Proton Pump Inhibitor" || cls==="Gabapentinoids"){
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
  // 1) Start from filtered base strengths
  const base = allowedStrengthsFilteredBySelection().filter(v=>v>0);

  // 2) Build piece sizes with splitting rules (unchanged)
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
// Normalize old spelling, then map to explicit slots
const mode = (ln.freqMode === "TDS") ? "TID" : ln.freqMode;
const slots =
  mode === "PATCH" ? [] :
  mode === "BID"   ? ["AM", "PM"] :
  mode === "TID"   ? ["AM", "MID", "PM"] :
  mode === "QID"   ? ["AM", "MID", "DIN", "PM"] :
                     [mode]; // single-slot: "AM" | "MID" | "DIN" | "PM"

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

/* ===== Opioids (tablets/capsules) — shave DIN→MID, then rebalance BID ===== */
function stepOpioid_Shave(packs, percent, cls, med, form){
  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // Respect selected products for rounding granularity
  const step = lowestStepMg(cls, med, form) || 1;

  let target = roundTo(tot * (1 - percent/100), step);
  if (target === tot && tot > 0) {
    target = Math.max(0, tot - step);
    target = roundTo(target, step);
  }

  let cur = {
    AM:  slotTotalMg(packs, "AM"),
    MID: slotTotalMg(packs, "MID"),
    DIN: slotTotalMg(packs, "DIN"),
    PM:  slotTotalMg(packs, "PM")
  };

  let reduce = +(tot - target).toFixed(3);

  const shave = (slot) => {
    if (reduce <= EPS || cur[slot] <= EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, roundTo(reduce, step));
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce    = +(reduce    - dec).toFixed(3);
  };

  // Same path you already use elsewhere for SR-style classes:
  if (cur.DIN > EPS) { shave("DIN"); shave("MID"); }
  else               { shave("MID"); }

  if (reduce > EPS) {
    const bidTarget = Math.max(0, +(cur.AM + cur.PM - reduce).toFixed(3));
    const bid = preferredBidTargets(bidTarget, cls, med, form);
    cur.AM = bid.AM; cur.PM = bid.PM;
    reduce = 0;
  }

  for (const k of ["AM","MID","DIN","PM"]) if (cur[k] < EPS) cur[k] = 0;

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

/* ===== Gabapentinoids — Gabapentin: DIN→(MID)→rebalance TID | Pregabalin: DIN→MID→rebalance BID ===== */
function stepGabapentinoid(packs, percent, med, form){
  const cls = "Gabapentinoids";
  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // Round targets to the lowest step permitted by the user's selected products
  const step = lowestStepMg(cls, med, form) || 1;

  let target = roundTo(tot * (1 - percent/100), step);
  if (target === tot && tot > 0) {               // ensure forward progress
    target = Math.max(0, tot - step);
    target = roundTo(target, step);
  }

  // Current slot totals
  let cur = {
    AM:  slotTotalMg(packs, "AM"),
    MID: slotTotalMg(packs, "MID"),
    DIN: slotTotalMg(packs, "DIN"),
    PM:  slotTotalMg(packs, "PM")
  };

  let reduce = +(tot - target).toFixed(3);

  // Shave helper (quantised to 'step')
  const shave = (slot) => {
    if (reduce <= EPS || cur[slot] <= EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, roundTo(reduce, step));
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce    = +(reduce    - dec).toFixed(3);
  };

  // ---------- Branch by medicine ----------
  const isGaba = /gabapentin/i.test(med);
  const isPreg = /pregabalin/i.test(med);

  if (isGaba) {
    // Rule: reduce DIN first; if needed reduce MID; then rebalance across TID (AM/MID/PM) with PM taking the remainder.
    if (cur.DIN > EPS) shave("DIN");
    if (reduce > EPS && cur.MID > EPS) shave("MID");

    if (reduce > EPS || true) {
      // Compute TID target and split with PM taking the remainder.
      const tidTotal = Math.max(0, +(cur.AM + cur.MID + cur.PM - reduce).toFixed(3));

      // Preferred TID split using 'step', PM carries the remainder.
      const base = Math.max(0, tidTotal - 2*step); // start safe, adjust below
      let am  = Math.floor((tidTotal / 3) / step) * step;
      let mid = am;
      let pm  = tidTotal - am - mid;

      // Quantise and nudge so AM/MID are <= PM, and all are multiples of step
      am  = roundTo(am,  step);
      mid = roundTo(mid, step);
      pm  = roundTo(pm,  step);

      // Fix any rounding drift by pushing difference to PM
      let sum = am + mid + pm;
      if (Math.abs(sum - tidTotal) > EPS) {
        const diff = tidTotal - sum;
        pm = roundTo(pm + diff, step);
      }

      // Guard against tiny negatives
      if (am  < EPS) am  = 0;
      if (mid < EPS) mid = 0;
      if (pm  < EPS) pm  = 0;

      cur.AM  = am;
      cur.MID = mid;
      cur.PM  = pm;
      cur.DIN = 0;
      reduce  = 0;
    }
  } else if (isPreg) {
    // Rule: reduce DIN first, then MID; then rebalance BID across AM/PM (PM takes the remainder).
    if (cur.DIN > EPS) shave("DIN");
    if (reduce > EPS && cur.MID > EPS) shave("MID");

    if (reduce > EPS) {
      const bidTarget = Math.max(0, +(cur.AM + cur.PM - reduce).toFixed(3));
      const bid = preferredBidTargets(bidTarget, cls, med, form); // uses lowestStepMg internally
      cur.AM = bid.AM;
      cur.PM = bid.PM;
      cur.MID = 0; // after shaving MID we end in BID shape
      reduce = 0;
    }
  } else {
    // Fallback (shouldn't hit, but keep safe): behave like opioids SR
    if (cur.DIN > EPS) shave("DIN");
    if (reduce > EPS) shave("MID");
    if (reduce > EPS) {
      const bidTarget = Math.max(0, +(cur.AM + cur.PM - reduce).toFixed(3));
      const bid = preferredBidTargets(bidTarget, cls, med, form);
      cur.AM = bid.AM; cur.PM = bid.PM; reduce = 0;
    }
  }

  // Clean up float dust
  for (const k of ["AM","MID","DIN","PM"]) if (cur[k] < EPS) cur[k] = 0;

  // Compose into actual products permitted by the current selection
  return recomposeSlots(cur, cls, med, form);
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

// If user left Phase 2 start blank but set Phase 2 %, simulate Phase 1 only,
// then auto-fill p2StartDate to the next day after Phase 1’s last step.
if (!p2Start && p2Pct > 0 && p2Int > 0 && $("p2StartDate")) {
  (function simulatePhaseOneAndAutoSetP2(){
    let simPacks = deepCopy(packs);
    let simDate  = new Date(startDate);
    let simWeek  = 1;

    // advance one Phase-1 step using your existing per-class stepping
    const stepPhase1 = () => {
      if (cls === "Opioid") simPacks = stepOpioid_Shave(simPacks, p1Pct, cls, med, form);
      else if (cls === "Proton Pump Inhibitor") simPacks = stepPPI(simPacks, p1Pct, cls, med, form);
      else if (cls === "Benzodiazepines / Z-Drug (BZRA)") simPacks = stepBZRA(simPacks, p1Pct, med, form);
      else if (cls === "Gabapentinoids") simPacks = stepGabapentinoid(simPacks, p1Pct, med, form);
      else simPacks = stepAP(simPacks, p1Pct, med, form);
    };

    // First Phase-1 step occurs on startDate
    stepPhase1();

    // Then keep stepping at p1Interval until Phase-1 would finish
    while (packsTotalMg(simPacks) > EPS && simWeek < MAX_WEEKS) {
      simDate  = addDays(simDate, p1Int);
      simWeek += 1;
      stepPhase1();
    }

    // Phase-2 starts the calendar day AFTER the last Phase-1 dose step
    const p2d = addDays(simDate, 1);
    const y = p2d.getFullYear();
    const m = String(p2d.getMonth() + 1).padStart(2, '0');
    const d = String(p2d.getDate()).padStart(2, '0');
    $("p2StartDate").value = `${y}-${m}-${d}`;
    p2Start = p2d; // update local variable so the rest of this builder uses it
  })();
}

  
  const rows=[]; let date=new Date(startDate); const capDate=new Date(+startDate + THREE_MONTHS_MS);

const doStep = (phasePct) => {
  if (cls === "Opioid") packs = stepOpioid_Shave(packs, phasePct, cls, med, form);
  else if (cls === "Proton Pump Inhibitor") packs = stepPPI(packs, phasePct, cls, med, form);
  else if (cls === "Benzodiazepines / Z-Drug (BZRA)") packs = stepBZRA(packs, phasePct, med, form);
  else if (cls === "Gabapentinoids") packs = stepGabapentinoid(packs, phasePct, med, form);
  else packs = stepAP(packs, phasePct, med, form);
};

  // Step 1 on start date using whichever phase applies at start
  const useP2Now = p2Start && (+startDate >= +p2Start);
  doStep(useP2Now ? p2Pct : p1Pct);
  console.log("[DEBUG] Step1 packs:", JSON.stringify(packs));
  if (packsTotalMg(packs) > EPS) rows.push({ week: 1, date: fmtDate(date), packs: deepCopy(packs), med, form, cls });

  let week=1;
  while (packsTotalMg(packs) > EPS) {
    const nextByP1 = addDays(date, p1Int);
    const nextByP2 = addDays(date, p2Int);
    let nextDate;

if (p2Start && +date < +p2Start) {
  // Stay on the Phase-1 cadence and switch phases at the NEXT boundary
  nextDate = nextByP1;                        // (e.g., 15 Sep in your example)
} else if (p2Start && +date >= +p2Start) {
  // We are now in Phase-2 time — follow P2 cadence
  nextDate = nextByP2;
} else {
  // No Phase-2 configured — keep Phase-1 cadence
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
function renderProductPicker(){
  // elements
  const card = document.getElementById("productPickerCard");
  const host = document.getElementById("productPicker");
  if (!card || !host) return;

  // current selection in the controls
  const clsEl  = document.getElementById("classSelect");
  const medEl  = document.getElementById("medicineSelect");
  const formEl = document.getElementById("formSelect");
  const cls  = (clsEl  && clsEl.value)  || "";
  const med  = (medEl  && medEl.value)  || "";
  const form = (formEl && formEl.value) || "";

  // ensure session store exists
  if (!window.SelectedFormulations) window.SelectedFormulations = new Set();

  // should we show this picker for the current med/form?
  const canShow = (typeof shouldShowProductPicker === "function")
    ? shouldShowProductPicker(cls, med, form)
    : true;

  // figure out strengths we can list
  const strengths = (typeof strengthsForPicker === "function") ? strengthsForPicker() : [];
  const hasAny = Array.isArray(strengths) && strengths.length > 0;

  if (!canShow || !hasAny){
    card.style.display = "none";
    host.innerHTML = "";
    return;
  }

  card.style.display = "";
  host.innerHTML = "";

  // build the checkbox list
  strengths.forEach(s => {
    const mg = (typeof parseMgFromStrength === "function")
      ? parseMgFromStrength(s)
      : (parseFloat(String(s).replace(/[^\d.]/g,"")) || 0);
    if (!Number.isFinite(mg) || mg <= 0) return;

    const id = `prod_${String(med).replace(/\W+/g,'_')}_${mg}`;

    const label = document.createElement("label");
    label.className = "checkbox";
    label.setAttribute("for", id);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.dataset.mg = String(mg);

    // if user has any selection, reflect it; otherwise leave unchecked (meaning "use all")
    cb.checked = (SelectedFormulations.size > 0) ? SelectedFormulations.has(mg) : false;

    cb.addEventListener("change", () => {
      if (cb.checked) SelectedFormulations.add(mg);
      else SelectedFormulations.delete(mg);
      if (typeof setDirty === "function") setDirty(true);
    });

    const span = document.createElement("span");
    const title = (typeof strengthToProductLabel === "function")
      ? strengthToProductLabel(cls, med, form, s)   // e.g., "600 mg tablet"
      : `${mg} mg`;
    span.innerHTML = formatOxyOnlyHTML(title);

    label.appendChild(cb);
    label.appendChild(span);
    host.appendChild(label);
  });

  // wire buttons (rebind on every render so they're always current)
  const btnSelectAll = document.getElementById("selectAllProductSelection");
  const btnClear     = document.getElementById("clearProductSelection");

  if (btnSelectAll){
    btnSelectAll.onclick = () => {
      SelectedFormulations.clear();
      // tick everything currently shown
      host.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        const mg = parseFloat(cb.dataset.mg);
        if (Number.isFinite(mg) && mg > 0) SelectedFormulations.add(mg);
      });
      if (typeof setDirty === "function") setDirty(true);
    };
  }

  if (btnClear){
    btnClear.onclick = () => {
      SelectedFormulations.clear();
      host.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      if (typeof setDirty === "function") setDirty(true);
    };
  }
}
// Auto-clear the selection whenever medicine or form changes, then re-render
(function wireProductPickerResets(){
  const med  = document.getElementById("medicineSelect");
  const form = document.getElementById("formSelect");
  const reset = () => {
    if (!window.SelectedFormulations) window.SelectedFormulations = new Set();
    SelectedFormulations.clear();
    renderProductPicker();
    if (typeof setDirty === "function") setDirty(true);
  };
  if (med  && !med._ppReset)  { med._ppReset  = true; med.addEventListener("change", reset); }
  if (form && !form._ppReset) { form._ppReset = true; form.addEventListener("change", reset); }
})();

function wireModeToggle(){
  const modeDefault = document.getElementById("modeDefault");
  const modeCustom  = document.getElementById("modeCustom");
  const customPanel = document.getElementById("customPanel");
  if (!modeDefault || !modeCustom || !customPanel) return; // elements not in DOM yet

  const sync = () => { customPanel.style.display = modeCustom.checked ? "block" : "none"; };

  modeDefault.addEventListener("change", sync);
  modeCustom .addEventListener("change", sync);
  // Initial state:
  sync();
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

cand.sort((a, b) => {
  const da = Math.abs(a - desired), db = Math.abs(b - desired);
  if (Math.abs(da - db) > 1e-9) return da - db; // 1) closest total wins

  // 2) on equal distance, prefer FEWEST PATCHES for that total
  const lenA = (sums.get(a) || [a]).length;
  const lenB = (sums.get(b) || [b]).length;
  if (lenA !== lenB) return lenA - lenB;

  // 3) still tied → prefer "up" (higher total)
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
  const baseAsc  = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const baseDesc = baseAsc.slice().sort((a,b)=>b-a);
  const split = canSplitTablets(r.cls, r.form, r.med);
  const byBase = {}; 
  const ensure = (b)=>{ byBase[b]=byBase[b]||{AM:0,MID:0,DIN:0,PM:0}; return byBase[b]; };

  // bucket pieces -> quarters/halves/whole counts per base strength
  ["AM","MID","DIN","PM"].forEach(slot=>{
    Object.entries(r.packs[slot]||{}).forEach(([pieceStr, count])=>{
      const piece=+pieceStr; let mapped=false;

      for(const b of baseDesc){ if(Math.abs(piece - b) < 1e-6){ ensure(b)[slot] += 4*count; mapped=true; break; } }
      if(mapped) return;

      if(split.half){
        for(const b of baseDesc){ if(Math.abs(piece - b/2) < 1e-6){ ensure(b)[slot] += 2*count; mapped=true; break; } }
      }
      if(mapped) return;

      if(split.quarter){
        for(const b of baseDesc){ if(Math.abs(piece - b/4) < 1e-6){ ensure(b)[slot] += 1*count; mapped=true; break; } }
      }
      if(mapped) return;

      // last-resort approximation to the smallest base
      const b0 = baseDesc[0];
      const qApprox = Math.max(1, Math.round(piece/(b0/4)));
      ensure(b0)[slot] += qApprox * count;
    });
  });

  const rows=[];
  const mkCell = (q)=> q ? qToCell(q) : "";

  // Order: prefer any AM presence first, then by mg desc
  const bases = Object.keys(byBase).map(parseFloat).sort((a,b)=>{
    const aHasAM = byBase[a].AM>0, bHasAM = byBase[b].AM>0;
    if(aHasAM!==bHasAM) return aHasAM ? -1 : 1;
    return b-a;
  });

  const medName = String(r.med || '');
  const suffix  = formSuffixWithSR(r.form);

  bases.forEach(b=>{
    const q=byBase[b], lines=[];
    if(q.AM)  lines.push(`Take ${tabletsPhraseDigits(q.AM)} in the morning`);
    if(q.MID) lines.push(`Take ${tabletsPhraseDigits(q.MID)} at midday`);
    if(q.DIN) lines.push(`Take ${tabletsPhraseDigits(q.DIN)} at dinner`);
    if(q.PM)  lines.push(`Take ${tabletsPhraseDigits(q.PM)} at night`);

    // Build the Strength label
// Build the strength label correctly (SR preserved; Oxy/Nx paired)
let strengthLabel;
if (/Oxycodone\s*\/\s*Naloxone/i.test(r.med)) {
  strengthLabel = oxyNxPairLabel(b); // e.g., "Oxycodone 20 mg + naloxone 10 mg SR tablet"
} else if (r.med === "Gabapentin" && r.form === "Tablet/Capsule") {
  const df = GABA_FORM_BY_STRENGTH[b] || "Capsule";
  strengthLabel = `${r.med} ${stripZeros(b)} mg ${df}`;
} else {
  strengthLabel = `${r.med} ${stripZeros(b)} mg ${formSuffixWithSR(r.form)}`;
}
   rows.push({
  strengthLabel: strengthLabel,
  instructions: lines.join("\n"),
  am: mkCell(q.AM), mid: mkCell(q.MID), din: mkCell(q.DIN), pm: mkCell(q.PM)
});
  });

  return rows;
}

/* =================== Build & init =================== */

function buildPlan(){
  // Patch-specific guard: enforce multiples (Fentanyl ×3d, Buprenorphine ×7d)
  if (typeof patchIntervalRule === "function" &&
      typeof validatePatchIntervals === "function" &&
      patchIntervalRule() && !validatePatchIntervals(true)) {
    return; // invalid interval → abort build
  }

    const med  = document.getElementById("medicineSelect")?.value;
  const form = document.getElementById("formSelect")?.value;
  const cls = document.getElementById("classSelect")?.value || "";
  
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

  // ▼ Apply opioid SR end-dose tail *before* rendering
  try {
    const cls  = document.getElementById("classSelect")?.value || "";
    const med  = document.getElementById("medicineSelect")?.value || "";
    const form = document.getElementById("formSelect")?.value || "";

    if (cls === "Opioid" && /SR/i.test(form) && typeof enforceOpioidEndDoseDefault === "function") {
      rows = enforceOpioidEndDoseDefault(rows, cls, med, form);
    }
  } catch (e) {
    console.warn("[end-dose enforcement skipped]", e);
  }

  if (typeof renderStandardTable === "function") renderStandardTable(rows);
}

  updateClassFooter(); // keep footer in sync with current class
  setGenerateEnabled(); // keep button/print gating in sync
  setDirty(false);
}

function updateRecommendedAndLines(){
  populateMedicines(); 
  populateForms(); 
  updateRecommended(); 
  applyPatchIntervalAttributes(); 
  resetDoseLinesToLowest();

  // NEW: rebuild product picker & clear previous selections on med/form change
  SelectedFormulations.clear();
  renderProductPicker();

  setFooterText($("classSelect")?.value);
  setDirty(true);
}


//#endregion
//#region 11. Boot / Init
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

  const classSel = document.getElementById("classSelect");
  
  // 3) Populate selects and force an initial selection
  populateClasses();
  populateMedicines();
  populateForms();
  resetDoseLinesToLowest();
  updateRecommended();
  applyPatchIntervalAttributes();
  renderProductPicker();
  if (typeof setFooterText === "function") setFooterText(document.getElementById("classSelect")?.value || "");

  // 4) Change handlers for dependent selects
  document.getElementById("classSelect")?.addEventListener("change", () => {
    populateMedicines();
    populateForms();
    updateRecommended();
    applyPatchIntervalAttributes();
    renderProductPicker();
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
    renderProductPicker();
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
    renderProductPicker();
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
document.getElementById("classSelect")?.addEventListener("change", () => {
  updateBestPracticeBox();
  updateClassFooter();
});

updateBestPracticeBox();
updateClassFooter();
  renderProductPicker();
  wireModeToggle();
  wireCustomPanel();
  wireCustomStepsLayout();
   syncModeVisibility();

  
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
/* ===================== Disclaimer gate + UI copy tweaks ===================== */
function setupDisclaimerGate(){
  const container = document.querySelector('.container') || document.body;
  if (!container || document.getElementById('disclaimerCard')) return;

  // Build disclaimer card
  const card = document.createElement('div');
  card.id = 'disclaimerCard';
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head"><h2>Important Notice</h2></div>
    <div class="disclaimer-copy">
      <p>This calculator is designed as an information tool only, and all information contained is solely for the use by a trained medical professional who is experienced in tapering medicines based on currently published evidence and are competent to understand the risk, benefits and alternatives to various medicine tapering plans and determine which medicine and dosage, if any, will be safe and effective for any particular patient. Clinical application of any data obtained by use of the calculator is the sole responsibility of the user only.</p>
      <label class="inline-label" for="acceptTaperDisclaimer">
        <strong>Check the box if you accept</strong>
        <input id="acceptTaperDisclaimer" type="checkbox" />
      </label>
    </div>
  `;

  // Insert at the very top of the app container
  container.insertBefore(card, container.firstChild);

  // Hide everything else until accepted (remember for this session)
  const siblings = Array.from(container.children).filter(el => el.id !== 'disclaimerCard');
  const accepted = sessionStorage.getItem('taper_disclaimer_accepted') === '1';
  siblings.forEach(el => el.classList.toggle('hide-until-accept', !accepted));

  const cb = card.querySelector('#acceptTaperDisclaimer');
  if (cb){
    cb.checked = accepted;
    cb.addEventListener('change', () => {
      const ok = cb.checked;
      siblings.forEach(el => el.classList.toggle('hide-until-accept', !ok));
      sessionStorage.setItem('taper_disclaimer_accepted', ok ? '1' : '0');
      if (ok) setTimeout(() => card.scrollIntoView({behavior:'smooth', block:'start'}), 0);
    });
  }

  // ---- Copy tweaks (titles/labels/notes) ----
  try {
    // Title: "Medicine Chart Input" -> "Medicine Tapering Calculator"
    document.querySelectorAll('.card-head h2, .card-head h3').forEach(h => {
      if (/\bMedicine Chart Input\b/i.test(h.textContent)) h.textContent = 'Medicine Tapering Calculator';
    });

    // "Start Date" -> "Start date for tapering"
    const sd = document.querySelector('label[for="startDate"]');
    if (sd){
      // If there's a nested span for the text, use it; else use the label itself
      const tgt = sd.querySelector('span') || sd;
      // Prefer replacing just the text part (preserve any inner controls)
      if (tgt.firstChild && tgt.firstChild.nodeType === 3) {
        tgt.firstChild.nodeValue = 'Start date for tapering';
      } else {
        tgt.textContent = 'Start date for tapering';
      }
    }

    // "Dose lines" pill -> "Current Dosage"
    const dl = document.querySelector('.dose-lines .badge');
    if (dl) dl.textContent = 'Current Dosage';

    // Remove the sentence: "Only Strength, Number of doses, and Frequency can be changed"
    Array.from(document.querySelectorAll('p, .hint, .note, li')).forEach(el => {
      if (/Only\s+Strength,\s*Number of doses,\s*and\s*Frequency\s*can\s*be\s*changed/i.test(el.textContent)) el.remove();
    });

    // Ensure line breaks for the two notes
    const sentences = [
      'If Phase 2 is partially complete or empty, only a single-phase tapering plan will be generated.',
      'Plans generated will be a maximum 3 months (or review date, if earlier).'
    ];
    // Find any existing element that contains either sentence
    const host = Array.from(document.querySelectorAll('.hint, .card p, .card .hint')).find(el => {
      const t = (el.textContent || '').trim();
      return t.includes(sentences[0]) || t.includes(sentences[1]);
    });

    if (host){
      // Remove any combined line that had both, then re-add as separate <p> hints (below the same card)
      const cardEl = host.closest('.card') || container;
      // Clean out existing occurrences inside that card
      Array.from(cardEl.querySelectorAll('p, .hint')).forEach(el => {
        const t = (el.textContent || '').trim();
        if (sentences.some(s => t.includes(s))) el.remove();
      });
      // Append them as distinct lines at the end of the card
      sentences.forEach(s => {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = s;
        cardEl.appendChild(p);
      });
    }
  } catch(e){ /* non-fatal */ }
}

// Run the disclaimer gate once the UI is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupDisclaimerGate);
} else {
  setupDisclaimerGate();
}
}

document.addEventListener("DOMContentLoaded", ()=>{ try{ init(); } catch(e){ console.error(e); alert("Init error: "+(e?.message||String(e))); }});
//#endregion
