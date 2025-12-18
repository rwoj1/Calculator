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

//#region 1) Helpers & Core Utilities
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
const MAX_WEEKS = 5200;
const DAYS_PER_MONTH = 28; // change to 30 if you prefer 30-day "months"
const MS_PER_DAY = 24 * 3600 * 1000;
const THREE_MONTHS_MS = 3 * DAYS_PER_MONTH * MS_PER_DAY; // only used as a fallback
const EPS = 1e-6;

// ===== Medicine class visibility toggles =====
const MEDICINE_CLASS_VISIBILITY = {
  "Opioid": true,
  "Benzodiazepine / Z-Drug (BZRA)": true,
  "Antipsychotic": false,
  "Proton Pump Inhibitor": true,
  "Gabapentinoid": true,
};

// Compute the maximum plan/chart date from user controls.
function getChartCapDate(startDate){
  const base = new Date(startDate);
  // If the start date is somehow invalid, fall back to 3 x DAYS_PER_MONTH from "now"
  if (!(base instanceof Date) || isNaN(+base)) {
    return addDays(new Date(), 3 * DAYS_PER_MONTH);
  }

  const durationRadio = document.getElementById("taperModeDuration");
  const durationSelect = document.getElementById("taperDuration");
  const endRadio      = document.getElementById("taperModeDate");
  const endInput      = document.getElementById("taperEndDate");

  // Helper: default to 3 x DAYS_PER_MONTH from the start date
  const fallbackCap = () => addDays(base, 3 * DAYS_PER_MONTH);

  // ----- Option A: duration-based mode (default / pre-selected) -----
  if (durationRadio && durationRadio.checked && durationSelect) {
    const raw = (durationSelect.value || "").trim();

    // "Until complete" → effectively uncapped, but with a generous safety ceiling
    if (raw === "complete") {
      const months = 600;
      return addDays(base, months * DAYS_PER_MONTH);
    }

    const months = parseInt(raw, 10);
    if (Number.isFinite(months) && months > 0) {
      return addDays(base, months * DAYS_PER_MONTH);
    }

    // If the value is somehow invalid, use the default
    return fallbackCap();
  }

  // ----- Option B: explicit end date -----
  if (endRadio && endRadio.checked && endInput) {
    // Prefer Flatpickr's parsed Date (endInput._flatpickr.selectedDates[0])
    let d = null;
    if (endInput._flatpickr && Array.isArray(endInput._flatpickr.selectedDates) && endInput._flatpickr.selectedDates[0]) {
      d = endInput._flatpickr.selectedDates[0];
    } else if (endInput.value) {
      // Fallback: parse "d/m/Y" (e.g. 15/12/2025) safely
      const parts = endInput.value.split("/").map(s => parseInt(s, 10));
      if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
        const [dd, mm, yyyy] = parts;
        d = new Date(yyyy, mm - 1, dd);
      }
    }
    if (d instanceof Date && !isNaN(+d) && +d >= +base) {
      return d; // respect the user’s chosen end date
    }
// If the chosen end date is invalid or earlier than the start date, fall back
    return fallbackCap();
  }

  // If controls are missing or unchecked, fall back to 3 x DAYS_PER_MONTH
  return fallbackCap();
}

//#endregion

//#region 2) Patch Interval Safety Rules
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

// --- Global AM/PM preference (used by all splitters & end-sequence code)
function getBidHeavierPreference(){
  try {
    const am = document.getElementById("bidHeavyAM");
    const pm = document.getElementById("bidHeavyPM");
    if (am && am.checked) return "AM";
    return "PM"; // default Night heavier
  } catch { return "PM"; }
}

// --- End-sequence helpers for BID classes (SR opioids & pregabalin) ---
// Lowest commercial strength AVAILABLE in the catalogue for the CURRENT med/form (ignores user selection)
// --- Commercial vs Selected strength helpers (robust) ---

function allCommercialStrengthsMg(cls, med, form){
  try {
    // Prefer a picker-aware source if available
    if (typeof strengthsForPicker === "function") {
      const arr = strengthsForPicker(cls, med, form);
      const mg = (arr || []).map(Number).filter(n => Number.isFinite(n) && n > 0);
      if (mg.length) return Array.from(new Set(mg)).sort((a,b)=>a-b);
    }
  } catch(_) {}
  try {
    // Fallback: catalogue scan
    const cat = (window.CATALOG?.[cls]?.[med]) || {};
    const pool = (form && cat[form]) ? cat[form] : Object.values(cat).flat();
    const mg = (pool || [])
      .map(v => (typeof v === 'number' ? v : parseMgFromStrength(v)))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a,b)=>a-b);
    if (mg.length) return Array.from(new Set(mg));
  } catch(_) {}
  return [];
}

// Keep labels aligned with the user's selected formulations.
// rewrite the label to the selected base strength so we don't "invent" a lower strength.
function prettySelectedLabelOrSame(cls, med, form, rawStrengthLabel){
  try {
    const chosen = (typeof strengthsForSelected === "function") ? strengthsForSelected() : [];
    const chosenMap = new Map((chosen||[]).map(s => [parseMgFromStrength(s), s])); // mg -> original label
    const targetMg = parseMgFromStrength(rawStrengthLabel);
    if (!Number.isFinite(targetMg) || targetMg <= 0) return rawStrengthLabel;
    if (chosenMap.has(targetMg)) return chosenMap.get(targetMg);
    const split = (typeof canSplitTablets === "function") ? canSplitTablets(cls, form, med) : {half:false, quarter:false};
    if (split.half && chosenMap.has(targetMg * 2)) return chosenMap.get(targetMg * 2);
    if (split.quarter && chosenMap.has(targetMg * 4)) return chosenMap.get(targetMg * 4);
    return rawStrengthLabel;
  } catch {
    return rawStrengthLabel;
  }
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
let _lastProductPickerKey = "";   // prevents cross-medicine selection carryover

function shouldShowProductPicker(cls, med, form){
  // Limit to the medicines you specified
  const isOpioidSR = cls === "Opioid" && /SR/i.test(form) && /Tablet/i.test(form);
  const allowList = [
    // ===== Opioids SR tablet (existing) =====
    ["Opioid","Morphine",/SR/i],
    ["Opioid","Oxycodone",/SR/i],
    ["Opioid","Oxycodone \/ Naloxone",/SR/i],
    ["Opioid","Tapentadol",/SR/i],
    ["Opioid","Tramadol",/SR/i],
    ["Opioid","Fentanyl",/Patch/i],
    ["Opioid","Buprenorphine",/Patch/i],

    // ===== Gabapentinoid (existing) =====
    ["Gabapentinoid","Gabapentin",/.*/],
    ["Gabapentinoid","Pregabalin",/Capsule/i],

    // ===== Benzodiazepines / Z-drugs (under your BZRA umbrella) =====
    ["Benzodiazepine / Z-Drug (BZRA)","Oxazepam",/(Tablet|Tab|Capsule|Cap)/i],
    ["Benzodiazepine / Z-Drug (BZRA)","Diazepam",/(Tablet|Tab|Capsule|Cap)/i],
    ["Benzodiazepine / Z-Drug (BZRA)","Alprazolam",/(Tablet|Tab|Capsule|Cap)/i],
    ["Benzodiazepine / Z-Drug (BZRA)","Clonazepam",/(Tablet|Tab|Capsule|Cap|ODT|Wafer)/i],
    ["Benzodiazepine / Z-Drug (BZRA)","Lorazepam",/(Tablet|Tab|Capsule|Cap|ODT|Wafer)/i],
    ["Benzodiazepine / Z-Drug (BZRA)", "Zolpidem", /^Slow Release Tablet$/i],

    // ===== Proton Pump Inhibitors (PPIs) =====
    ["Proton Pump Inhibitor","Pantoprazole",/(Tablet|Tab|Capsule|Cap)/i],
    ["Proton Pump Inhibitor","Omeprazole",/(Tablet|Tab|Capsule|Cap)/i],
    ["Proton Pump Inhibitor","Esomeprazole",/(Tablet|Tab|Capsule|Cap)/i],
    ["Proton Pump Inhibitor","Rabeprazole",/(Tablet|Tab|Capsule|Cap)/i],
    ["Proton Pump Inhibitor", "Lansoprazole", /^Orally Dispersible Tablet$/i],
    ["Proton Pump Inhibitor", "Lansoprazole", /^Tablet$/i],

    // ===== Antipsychotics =====
    ["Antipsychotic","Quetiapine",  /Immediate\s*Release\s*Tablet|^Tablet$/i],
    ["Antipsychotic","Risperidone", /Tablet/i],
    ["Antipsychotic","Olanzapine",  /Tablet/i],
  ];

  return allowList.some(([c,m,formRe]) =>
    c===cls && new RegExp(m,"i").test(med||"") && formRe.test(form||"")
  );
}

// Build a nice per-product label
function strengthToProductLabel(cls, med, form, strengthStr){
  // PATCH: label patch strengths as mcg/hr
  if (/Patch/i.test(form)) {
    const rate = (typeof parsePatchRate === "function")
      ? parsePatchRate(strengthStr)
      : (parseFloat(String(strengthStr).replace(/[^\d.]/g,"")) || 0);

    return `${med} ${stripZeros(rate)} mcg/hr patch`;
  }

  // tablets/capsules (mg)
  const mg = parseMgFromStrength(strengthStr);

  if (/^Gabapentin$/i.test(med)) {
    const f = gabapentinFormForMg(mg).toLowerCase();
    return `${stripZeros(mg)} mg ${f}`;
  }

  if (/Oxycodone\s*\/\s*Naloxone/i.test(med)) {
    return oxyNxPairLabel(mg);
  }

  return `${med} ${stripZeros(mg)} mg ${formSuffixWithSR(form)}`;
}


// Which strengths are available for the picker (we use whatever the current Form provides)
// For Gabapentin you already expose both tablet & capsule strengths via “Tablet/Capsule”.
function strengthsForPicker(){
  const form = document.getElementById("formSelect")?.value || "";
  const arr = strengthsForSelected().slice();

  if (/Patch/i.test(form)) {
    return arr.sort((a,b)=>parsePatchRate(a)-parsePatchRate(b));
  }
  return arr.sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
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

// Greatest common divisor for integers (mg strengths should be integers)
function _gcd(a, b){
  a = Math.abs(a|0); b = Math.abs(b|0);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 0;
}

// Compute the effective rounding grid ("quantum") from *pieces* we can actually give.
// Uses the available/selected base strengths, then adds halves/quarters if the
// tablet can be split (and the BZRA quarter toggle is on). The quantum is the
// smallest positive piece.
function effectiveQuantumMg(cls, med, form){
  try {
    // Base strengths (mg) – respects product picker when used
    const bases = stepBaseStrengthsMg(cls, med, form) || [];

    // Splitting rules for this med/form (e.g. BZRA quarters toggle, SR/ODT cannot split)
    const split = (typeof canSplitTablets === "function")
      ? canSplitTablets(cls, form, med)
      : { half: false, quarter: false };

    const pieces = [];

    for (const raw of bases) {
      const mg = Number(raw);
      if (!Number.isFinite(mg) || mg <= 0) continue;

      // whole tablet
      pieces.push(mg);

      // half tablet if allowed
      if (split.half) {
        pieces.push(mg / 2);
      }

      // quarter tablet if allowed
      if (split.quarter) {
        pieces.push(mg / 4);
      }
    }

    // Clean up: round to 3 decimal places, dedupe, sort
    const clean = Array.from(
      new Set(
        pieces
          .map(x => +(+x).toFixed(4))
          .filter(x => x > 0)
      )
    ).sort((a, b) => a - b);

    if (clean.length) {
      // The quantum is simply the smallest piece we can actually dispense
      return clean[0];
    }

    // Fallback: use your existing min step
    return lowestStepMg(cls, med, form) || 1;
  } catch {
    return lowestStepMg(cls, med, form) || 1;
  }
}

// --- Always-UP rounding helpers for % reductions (selection-aware) ---
function ceilToQuantum(val, q){
  return Math.ceil(val / q) * q;
}

// Centralised target calculation used by the schedule/table
// - Rounds UP to quantum (GCD of selected strengths)
// - If rounding-up would stall (no change), drop by one quantum
function alwaysUpTarget(totalMg, percent, cls, med, form){
  const q = (typeof effectiveQuantumMg === "function"
    ? effectiveQuantumMg(cls, med, form)
    : (typeof lowestStepMg === "function" ? lowestStepMg(cls, med, form) : 1)) || 1;

  const raw = totalMg * (1 - percent/100);
  let target = ceilToQuantum(raw, q);

  if (target === totalMg && totalMg > 0){
    target = Math.max(0, totalMg - q);
  }
  return { target, quantum: q };
}

function snapTargetToSelection(totalMg, percent, cls, med, form){
  const stepMin = lowestStepMg(cls, med, form) || 1;           // difference cap / UI rules
  const q       = effectiveQuantumMg(cls, med, form) || stepMin; // rounding grid (GCD)
  const raw     = totalMg * (1 - percent/100);

  // ALWAYS ROUND UP to the quantum
  let target = Math.ceil(raw / q) * q;

  // ensure progress if rounding would stall (i.e., stays the same dose)
  if (target === totalMg && totalMg > 0) {
    target = Math.max(0, totalMg - q);
  }

  return { target, step: stepMin, quantum: q };
}

function bzraVisibilityTick() {
  const box = document.getElementById("bzraSplitOptions");
  if (!box) return;

  const cls = document.getElementById("classSelect")?.value || "";
  const isBZRA = (cls === "Benzodiazepine / Z-Drug (BZRA)");

  box.style.display = isBZRA ? "block" : "none";
}
function printAdminVisibilityTick(){
  const btn = document.getElementById("printAdminBtn");
  if (!btn) return;

  const med  = document.getElementById("medicineSelect")?.value || "";
  const form = document.getElementById("formSelect")?.value || "";

  const hide = /Patch/i.test(form) && /(Fentanyl|Buprenorphine)/i.test(med);
  btn.style.display = hide ? "none" : "";
}
function bidPrefVisibilityTick(){
  const box = document.getElementById("bidPrefCard");
  if (!box) return;

  const cls  = document.getElementById("classSelect")?.value || "";
  const med  = document.getElementById("medicineSelect")?.value || "";
  const form = document.getElementById("formSelect")?.value || "";

  const isOpioidSrTablet =
    (cls === "Opioid") && (/SR/i.test(form)) && (/Tablet/i.test(form));

  const isPregabalin =
    (cls === "Gabapentinoid") && (/^Pregabalin$/i.test(med));

  box.style.display = (isOpioidSrTablet || isPregabalin) ? "" : "none";
}

//#endregion

//#region 3) Antipsychotic UI Wiring
/* ===== Antipsychotic UI wiring (layout only) ===== */
;(() => {
  const $id = (s) => document.getElementById(s);

  // Caps (mg/day)
  const AP_MAX = {
    Quetiapine: 150,
    Risperidone: 2,
    Olanzapine: 10,
  };

  // Human label for the brief line
  const DRUG_LABEL = {
    Quetiapine: "Quetiapine — maximum 150 mg/day",
    Risperidone: "Risperidone — maximum 2 mg/day",
    Olanzapine: "Olanzapine — maximum 10 mg/day",
  };
  // --- NEW: reset the four AP inputs to 0 ---
  function apResetInputsToZero(andUpdate=true){
  ["apDoseAM","apDoseMID","apDoseDIN","apDosePM"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });
  if (andUpdate && typeof apUpdateTotal === "function") apUpdateTotal();
  }
  // Show/hide panel & order row; fill the brief; update total
 
function apVisibilityTick(){
  const cls = document.getElementById("classSelect")?.value || "";
  const med = document.getElementById("medicineSelect")?.value || "";

  // compute first, then toggle UIs
  const isAP = (cls === "Antipsychotic");

  const panel = document.getElementById("apControls");
  const order = document.getElementById("apOrderRow");
  if (!panel || !order) return;

  panel.style.display = isAP ? "" : "none";
  order.style.display = isAP ? "" : "none";

  // hide/show the legacy dose-lines UI only after we KNOW isAP
  apToggleCurrentDoseUI(isAP);

  if (!isAP) { apMarkDirty?.(false); return; }

  // brief text (shows cap if known, otherwise prompt)
  const AP_MAX = { Quetiapine:150, Risperidone:2, Olanzapine:10 };
  const brief = document.getElementById("apBriefDrug");
  if (brief) {
    if (AP_MAX[med]) brief.textContent = `${med} — maximum ${AP_MAX[med]} mg/day`;
    else brief.textContent = "Select a medicine";
  }

  apEnsureChipLabels?.();
  apUpdateTotal?.();
}
  
  // Read the four inputs (mg; numbers)
  function apReadInputs() {
    const get = (id) => {
      const v = parseFloat($id(id)?.value || "0");
      return Number.isFinite(v) ? Math.max(0, v) : 0;
    };
    return {
      AM:  get("apDoseAM"),
      MID: get("apDoseMID"),
      DIN: get("apDoseDIN"),
      PM:  get("apDosePM"),
    };
  }

  function apUpdateTotal() {
    const box = $id("apTotalBox");
    if (!box) return;

    const med = $id("medicineSelect")?.value || "";
    const cap = AP_MAX[med] || 0;

    const { AM, MID, DIN, PM } = apReadInputs();
    const total = AM + MID + DIN + PM;

    // Text: “X mg / Y mg max”
    const fmt = (x) => (Math.round(x*100)/100).toString();
    box.textContent = `${fmt(total)} mg / ${fmt(cap)} mg max`;

    // Color: green when <= cap, red when over
    box.classList.remove("ap-ok","ap-err");
    if (cap > 0) {
      if (total <= cap) box.classList.add("ap-ok");
      else box.classList.add("ap-err");
    }
  }

  // (Optional) simple badge refresh for the chips — keeps 1..4 visible
  function apRefreshBadges() {
    const chips = [...document.querySelectorAll("#apOrder .ap-chip")];
    chips.forEach((chip, i) => {
      const b = chip.querySelector(".ap-badge");
      if (b) b.textContent = String(i + 1);
    });
  }
  // Hide/show the generic Current Dosage UI when Antipsychotic is active
// Hide/show the legacy dose-lines UI when Antipsychotic is active
function apToggleCurrentDoseUI(isAP){
  // Whole dose-lines block
  const lines = document.getElementById("doseLinesContainer")
            || document.querySelector(".dose-lines");
  if (lines) {
    lines.style.display = isAP ? "none" : "";
    // Also disable its controls so nothing leaks into packs
    [...lines.querySelectorAll("input, select, button")].forEach(el=>{
      if (isAP) el.setAttribute("disabled","disabled");
      else el.removeAttribute("disabled");
    });
  }

  // “Add dose line” button (cover common ids/classes)
  const addBtn =
      document.getElementById("addDoseLineBtn")
   || document.getElementById("addDoseLine")
   || document.querySelector("[data-action='add-dose-line'], .btn-add-dose-line");
  if (addBtn) addBtn.style.display = isAP ? "none" : "";

  // Per-line “Remove” buttons
  document.querySelectorAll(
    ".dose-lines .btn-remove, .dose-line .remove-line, .dose-lines [data-action='remove-dose-line']"
  ).forEach(btn => { btn.style.display = isAP ? "none" : ""; });
}

// Ensure chips show full labels (Morning/Midday/Dinner/Night)
function apEnsureChipLabels(){
  const LABELS = { AM: "Morning", MID: "Midday", DIN: "Evening", PM: "Night" };

  document.querySelectorAll("#apOrder .ap-chip").forEach((chip, i) => {
    const slot = chip.getAttribute("data-slot") || "";
    // Ensure badge exists and shows 1..4
    let badge = chip.querySelector(".ap-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ap-badge";
      chip.prepend(badge);
    }
    badge.textContent = String(i + 1);

    // Ensure label node exists and has correct text
    let label = chip.querySelector(".ap-chip-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "ap-chip-label";
      chip.appendChild(label);
    }
    label.textContent = LABELS[slot] || slot || "";
  });
}
// --- Drag & drop chips + public getter ---

function apInitChips(){
  const wrap = document.getElementById("apOrder"); 
  if (!wrap) return;

  // Make chips draggable and ensure labels stay present
  wrap.querySelectorAll(".ap-chip").forEach(chip=>{
    chip.setAttribute("draggable", "true");
    chip.setAttribute("tabindex", "0"); // keyboard focusable
  });

  let dragged = null;

  wrap.addEventListener("dragstart", e=>{
    const t = e.target.closest(".ap-chip"); if (!t) return;
    dragged = t;
    t.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  wrap.addEventListener("dragend", ()=>{
    dragged?.classList.remove("dragging");
    dragged = null;
    apRefreshBadges();
  });

  wrap.addEventListener("dragover", e=>{
    e.preventDefault();
    const after = getChipAfter(wrap, e.clientX);
    if (!dragged) return;
    if (after == null) wrap.appendChild(dragged);
    else wrap.insertBefore(dragged, after);
  });

  // Keyboard support: ← / → to move focused chip
  wrap.addEventListener("keydown", e=>{
    const t = e.target.closest(".ap-chip"); if (!t) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight"){
      e.preventDefault();
      const chips = [...wrap.querySelectorAll(".ap-chip")];
      const i = chips.indexOf(t);
      const j = (e.key === "ArrowLeft") ? Math.max(0, i-1) : Math.min(chips.length-1, i+1);
      if (i !== j) {
        wrap.insertBefore(t, chips[j + (e.key === "ArrowRight" ? 1 : 0)] || null);
        apRefreshBadges();
        t.focus();
      }
    }
  });

  apRefreshBadges();

  function getChipAfter(container, x){
    const chips = [...container.querySelectorAll(".ap-chip:not(.dragging)")];
    let closest = null, closestOffset = Number.NEGATIVE_INFINITY;
    for (const chip of chips){
      const rect = chip.getBoundingClientRect();
      const offset = x - rect.left - rect.width/2;
      if (offset < 0 && offset > closestOffset){
        closestOffset = offset; closest = chip;
      }
    }
    return closest;
  }
}

// Public helper: read current order as ["AM","MID","DIN","PM"]
function apGetReductionOrder(){
  return [...(document.getElementById("apOrder")?.querySelectorAll(".ap-chip") || [])]
    .map(ch => ch.getAttribute("data-slot"));
}

  // Hook up events once
document.addEventListener("DOMContentLoaded", () => {
  ["classSelect","medicineSelect","formSelect"].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const cls = document.getElementById("classSelect")?.value || "";
      const isAP = (cls === "Antipsychotic");
      if (id === "medicineSelect" && isAP) apResetInputsToZero(true);  // <-- reset to 0 on med change
      apVisibilityTick();
    });
  });

    // Inputs → recompute total live
    ["apDoseAM","apDoseMID","apDoseDIN","apDosePM"].forEach(id => {
      const el = $id(id);
      if (el) el.addEventListener("input", apUpdateTotal);
    });

    // First paint
    apVisibilityTick();
    apRefreshBadges();
    apEnsureChipLabels();
    apInitChips();
    apToggleCurrentDoseUI((document.getElementById("classSelect")?.value || "") === "Antipsychotic");

  });
})();

//#endregion

//#region 4) Antipsychotic Dose Seeding
/* ===== Antipsychotics: seed packs from the four AM/MID/DIN/PM inputs ===== */
function apSeedPacksFromFourInputs(){
  // Prefer your existing reader if present
  let doses = {};
  if (typeof apReadInputs === "function") {
    // Expected shape: { AM:number, MID:number, DIN:number, PM:number }
    doses = apReadInputs() || {};
  } else {
    // Simple DOM fallback
    const read = (id) => {
      const raw = (document.getElementById(id)?.value || "0").toString().replace(/[, ]/g,"");
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };
    doses = {
      AM:  read("apDoseAM"),
      MID: read("apDoseMID"),
      DIN: read("apDoseDIN"),
      PM:  read("apDosePM"),
    };
  }

  const cls  = $("classSelect")?.value || "Antipsychotic";
  const med  = $("medicineSelect")?.value || "";
  const form = $("formSelect")?.value || "Tablet";

  // Build slot packs using your existing composer so it honours:
  // - selected formulations (the product picker)
  // - halves where allowed
  // - your global tie-breakers
  const out = { AM:{}, MID:{}, DIN:{}, PM:{} };
  ["AM","MID","DIN","PM"].forEach(slot => {
    const mg = +(doses[slot] || 0);
    if (mg > 0) {
      const pack = composeForSlot(mg, cls, med, form);
      out[slot] = pack || {};
    }
  });
  return out;
}
// --- NEW: check if AP total exceeds cap ---
function apIsOverCap(){
  const cls = document.getElementById("classSelect")?.value || "";
  if (cls !== "Antipsychotic") return false;
  const med = document.getElementById("medicineSelect")?.value || "";
  const AP_MAX = { Quetiapine:150, Risperidone:2, Olanzapine:10 };

  // read inputs
  const read = (id)=>parseFloat(document.getElementById(id)?.value || "0")||0;
  const total = read("apDoseAM")+read("apDoseMID")+read("apDoseDIN")+read("apDosePM");
  const cap = AP_MAX[med] || 0;
  return cap>0 && total>cap;
}

// --- NEW: mark output dirty / clean & disable/enable print/download buttons ---
function apMarkDirty(isDirty, message){
  const scheduleHost = document.getElementById("scheduleBlock");
  const warnId = "apCapWarn";
  if (scheduleHost) {
    if (isDirty){
      scheduleHost.innerHTML = `<div id="${warnId}" class="alert alert-danger" role="alert">
        ${message || "The total daily dose exceeds the maximum for this medicine. Adjust the Current Dosage to proceed."}
      </div>`;
    } else {
      // do nothing here; your normal renderer will populate as usual
    }
  }
  // disable/enable print/download
  const disable = (sel)=>{
    document.querySelectorAll(sel).forEach(btn=>{
      btn.setAttribute("disabled","disabled");
      btn.classList.add("is-disabled");
      btn.title = "Printing disabled until dose is within maximum.";
    });
  };
  const enable = (sel)=>{
    document.querySelectorAll(sel).forEach(btn=>{
      btn.removeAttribute("disabled");
      btn.classList.remove("is-disabled");
      btn.removeAttribute("title");
    });
  };
  if (isDirty){
    disable("#printBtn, #printAdminBtn, #btnPrint, .btn-print, #downloadBtn, .btn-download");
  } else {
    enable("#printBtn, #printAdminBtn, #btnPrint, .btn-print, #downloadBtn, .btn-download");
  }
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
  // Previous versions tried to reformat the date cells (e.g. add "Mon/Tue").
  // That made the parsing for the administration calendars brittle.
  // We now leave the table dates exactly as they are and just return
  // a no-op cleanup function.
  return () => {};
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
//#endregion

//#region 5) Gabapentinoid Helpers
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
function selectedProductMgs(){
  // We store selected base strengths (mg) in a Set. If empty → null (use all).
  if (!window.SelectedFormulations || SelectedFormulations.size === 0) return null;
  return Array.from(SelectedFormulations).filter(n => Number.isFinite(n) && n > 0);
}
function strengthsForSelectedSafe(cls, med, form){
  try {
    if (typeof strengthsForSelected === "function") {
      return strengthsForSelected().map(parseMgFromStrength).filter(v => v > 0);
    }
    const cat = (window.CATALOG?.[cls]?.[med]) || {};
    const arr = (cat && (cat[form] || Object.values(cat).flat())) || [];
    return arr.map(parseMgFromStrength).filter(v => v > 0);
  } catch (_) {
    return [];
  }
}
function hasSelectedCommercialLowest(cls, med, form) {
  const toMg = (s) => {
    const m = String(s).match(/([\d.]+)\s*mg/i);
    return m ? parseFloat(m[1]) : NaN;
  };

  const catalog = (typeof strengthsForSelected === "function")
    ? (strengthsForSelected() || [])
    : [];
  const catalogMg = catalog.map(toMg).filter((x) => Number.isFinite(x));
  if (catalogMg.length === 0) return false;

  const lowestCommercial = Math.min.apply(null, catalogMg);

  const selected = (typeof strengthsForSelectedSafe === "function")
    ? (strengthsForSelectedSafe(cls, med, form) || [])
    : catalog;

  const selectedList = (selected.length === 0) ? catalog : selected;
  const selectedMg = selectedList.map(toMg).filter((x) => Number.isFinite(x));
  if (selectedMg.length === 0) return false;

  return selectedMg.some((mg) => Math.abs(mg - lowestCommercial) < 1e-9);
}

//#endregion

//#region 6) Print & Admin Record Helpers
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
// Build print-only Administration Record calendars (one month per page)
function buildAdministrationCalendars() {
  const { table, type } = getPrintTableAndType();
  if (!table) return () => {};
  const med  = document.getElementById("medicineSelect")?.value || "";
  const form = document.getElementById("formSelect")?.value || "";
  if (/Patch/i.test(form) && /(Fentanyl|Buprenorphine)/i.test(med)) return () => {};
  
  // Helper: parse whatever date text is in the table into a Date
  const parseDMY = (s) => {
    const text = String(s || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const dt = new Date(text);
    if (!dt || isNaN(dt.getTime())) return null;
    return dt;
  };

  // Scan table rows to find all taper dates + any review dates
  const allDates = [];
  const reviewDates = [];
  const stopDates = [];

  const rows = table.querySelectorAll("tbody.step-group tr");
  rows.forEach(tr => {
    let tdDate;
    if (type === "standard") {
      // standard tablet table: date column has class "col-date"
      tdDate = tr.querySelector("td.col-date");
    } else {
      // patch table: first column ("Apply on") holds the date
      tdDate = tr.querySelector("td") || null;
    }
    if (!tdDate) return;

    const dateText = (tdDate.textContent || "").trim();
    if (!dateText) return; // skip blank / spacer rows

    const dt = parseDMY(dateText);
    if (!dt) return;
    allDates.push(dt);

    // Final / review cell is marked with "final-cell"
const finalCell = tr.querySelector("td.final-cell");
if (finalCell) {
  const msg = (finalCell.textContent || "").toLowerCase();
  if (msg.includes("review")) reviewDates.push(dt);
  if (msg.includes("stop")) stopDates.push(dt);
}
  });

  if (!allDates.length) {
    // Nothing to build calendars from
    return () => {};
  }

  // Sort and deduplicate taper step dates
  const uniqDates = Array.from(new Set(allDates.map(d => d.getTime())))
    .sort((a, b) => a - b)
    .map(ms => new Date(ms));

  const startDate = uniqDates[0];
  const endDate   = uniqDates[uniqDates.length - 1];

// Time slots + labels (Dinner -> Evening)
const SLOT_COLS = [
  { sel: "td.col-am",  key: "AM",  label: "Morning" },
  { sel: "td.col-mid", key: "MID", label: "Midday" },
  { sel: "td.col-din", key: "EVE", label: "Evening" },
  { sel: "td.col-pm",  key: "PM",  label: "Night" },
];

// Build a map: stepDateMs -> Set of slots used at that step
const stepSlots = new Map();

if (type === "standard") {
  const rowsAll = Array.from(table.querySelectorAll("tbody.step-group tr"));

  let currentStepMs = null;

  const nonZero = (td) => {
    const t = (td?.textContent || "").replace(/\s+/g, "").trim();
    if (!t) return false;
    // treat any non-zero as used (covers "1", "0.5", tablet icons with text, etc)
    const n = Number(t);
    return Number.isFinite(n) ? n !== 0 : true;
  };

  rowsAll.forEach(tr => {
    // Step date appears only on the first row of each group
    const tdDate = tr.querySelector("td.col-date");
    const dateText = (tdDate?.textContent || "").trim();
    if (dateText) {
      const dt = parseDMY(dateText);
      if (dt) currentStepMs = dt.getTime();
    }
    if (currentStepMs == null) return;

    // Ensure a set exists
    if (!stepSlots.has(currentStepMs)) stepSlots.set(currentStepMs, new Set());

    // Add any used slots from this row
    SLOT_COLS.forEach(s => {
      const td = tr.querySelector(s.sel);
      if (td && nonZero(td)) stepSlots.get(currentStepMs).add(s.key);
    });
  });
}

// Sorted list of step dates (ms) for lookup
const stepMsList = uniqDates.map(d => d.getTime()).sort((a,b)=>a-b);

// For any calendar day, use the most recent step date <= that day
const slotsForDay = (d) => {
  const dayMs = d.getTime();
  let chosenMs = null;
  for (let i = 0; i < stepMsList.length; i++) {
    if (stepMsList[i] <= dayMs) chosenMs = stepMsList[i];
    else break;
  }
  const set = (chosenMs != null) ? stepSlots.get(chosenMs) : null;

  // Fallback: if we couldn't detect slots, show all 4 (keeps behavior safe)
  const keys = (set && set.size) ? Array.from(set) : SLOT_COLS.map(s => s.key);

  // Return slot objects in the standard display order
  return SLOT_COLS.filter(s => keys.includes(s.key));
};
 
  const sameYMD = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth() &&
    a.getDate()     === b.getDate();

  const isReviewDate = (d) =>
    reviewDates.some(r => sameYMD(r, d));
  
  const isStopDate = (d) =>
  stopDates.some(s => sameYMD(s, d));

  const isStepDate = (d) =>
    uniqDates.some(dt => sameYMD(dt, d));

  const card = document.getElementById("outputCard");
  if (!card) return () => {};

  const block = document.createElement("div");
  block.id = "adminRecordBlock";
  block.className = "admin-record-block print-only";

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  // Month iteration: from startDate.month to endDate.month inclusive
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (
    cursor.getFullYear() < endDate.getFullYear() ||
    (cursor.getFullYear() === endDate.getFullYear() &&
     cursor.getMonth()    <= endDate.getMonth())
  ) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

    const monthWrapper = document.createElement("div");
    monthWrapper.className = "admin-month";

    const title = document.createElement("h2");
    title.className = "admin-month-heading";
    title.textContent =
      `Administration record – ${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`;
    monthWrapper.appendChild(title);

    const note = document.createElement("p");
    note.className = "admin-month-note";
    note.innerHTML =
      "Tick the box after you have taken your dose.<br>";
    monthWrapper.appendChild(note);

    // Calendar table
    const tbl = document.createElement("table");
    tbl.className = "admin-calendar";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(dow => {
      const th = document.createElement("th");
      th.textContent = dow;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    tbl.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Compute leading blanks (calendar starts Monday)
    const firstDay = (monthStart.getDay() + 6) % 7; // JS Sunday=0 → Monday=0
    let currentRow = document.createElement("tr");
    for (let i = 0; i < firstDay; i++) {
      const td = document.createElement("td");
      td.className = "admin-empty";
      currentRow.appendChild(td);
    }

    // Build each day cell
    for (let d = 1; d <= monthEnd.getDate(); d++) {
      const cellDate = new Date(cursor.getFullYear(), cursor.getMonth(), d);

      if (currentRow.children.length === 7) {
        tbody.appendChild(currentRow);
        currentRow = document.createElement("tr");
      }

      const td = document.createElement("td");
      td.className = "admin-day";

      const label = document.createElement("div");
      label.className = "day-number";
      label.textContent = d.toString();
      td.appendChild(label);

      const inWindow =
        cellDate >= startDate &&
        cellDate <= endDate;
        
      const stepDay = isStepDate(cellDate);
      const reviewDay = isReviewDate(cellDate);
      const stopDay = isStopDate(cellDate);
      
// Light grey for days entirely outside the taper window
if (!inWindow) {
  td.classList.add("admin-day-outside");
} else if (!stopDay) {
  // tick boxes ONLY on days within the taper window AND not a Stop day
  slotsForDay(cellDate).forEach(({ label }) => {
    const row = document.createElement("div");
    row.className = "dose-row";
    const box = document.createElement("span");
    box.className = "admin-checkbox";
    const text = document.createElement("span");
    text.textContent = ` ${label}`;
    row.appendChild(box);
    row.appendChild(text);
    td.appendChild(row);
  });
}
  if (inWindow) {
  if (stepDay && !stopDay) {
    td.classList.add("admin-day-step");
    if (!reviewDay) {
      const stepTag = document.createElement("div");
      stepTag.className = "step-label";
      stepTag.textContent = "Dose reduction";
      td.appendChild(stepTag);
    }
  }

  if (reviewDay) {
    td.classList.add("admin-day-review");
    const reviewTag = document.createElement("div");
    reviewTag.className = "review-label";
    reviewTag.textContent = "See prescriber";
    td.appendChild(reviewTag);
  }
       if (stopDay) {
  td.classList.add("admin-day-review"); 
  const stopTag = document.createElement("div");
  stopTag.className = "review-label";
  stopTag.textContent = "Stop";
  td.appendChild(stopTag);
}
}
      currentRow.appendChild(td);
    }

    // Trailing blanks to complete the last week row
    while (currentRow.children.length && currentRow.children.length < 7) {
      const td = document.createElement("td");
      td.className = "admin-empty";
      currentRow.appendChild(td);
    }
    if (currentRow.children.length) {
      tbody.appendChild(currentRow);
    }

    tbl.appendChild(tbody);
    monthWrapper.appendChild(tbl);

    // Page break after each month
    const pb = document.createElement("div");
    pb.className = "page-break";
    monthWrapper.appendChild(pb);

// Notes section (print-only)
const notes = document.createElement("div");
notes.className = "admin-notes";

const notesTitle = document.createElement("div");
notesTitle.className = "admin-notes-title";
notesTitle.textContent = "Notes (eg activity level, sleep, withdrawal effects, ability to think clearly, social life)";

const notesBox = document.createElement("div");
notesBox.className = "admin-notes-box";

notes.appendChild(notesTitle);
notes.appendChild(notesBox);
monthWrapper.appendChild(notes);

    
    block.appendChild(monthWrapper);

    // Move to next month
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  card.appendChild(block);

  // Cleanup: remove block after printing
  return () => {
    block.remove();
  };
}

// ---- Print functions ----

function printOutputOnly(){
  if (_dirtySinceGenerate) {
    alert("Please re-generate the chart before printing.");
    return;
  }
  const anyTable = document.querySelector("#scheduleBlock table, #patchBlock table");
  if (!anyTable) {
    alert("There is no taper chart to print.");
    return;
  }

  document.body.classList.add("printing");
  const cleanupDecor = preparePrintDecorations();

  window.print();

  setTimeout(() => {
    document.body.classList.remove("printing");
    try { cleanupDecor(); } catch(e) {}
  }, 100);
}

function printWithAdministrationRecord(){
  if (_dirtySinceGenerate) {
    alert("Please re-generate the chart before printing.");
    return;
  }
  const anyTable = document.querySelector("#scheduleBlock table, #patchBlock table");
  if (!anyTable) {
    alert("There is no taper chart to print.");
    return;
  }

  document.body.classList.add("printing");

  const cleanupDecor = preparePrintDecorations();
  const cleanupAdmin = buildAdministrationCalendars();

  window.print();

  setTimeout(() => {
    document.body.classList.remove("printing");
    try { cleanupDecor(); } catch(e) {}
    try { cleanupAdmin(); } catch(e) {}
  }, 100);
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
// --- Suggested Practice copy (updated wording and titles) ---
const SUGGESTED_PRACTICE = {
  opioids: `
  <p>
    Tapering should be <strong>gradual</strong> and <strong>individualised</strong> to the person’s current opioid regimen, clinical characteristics, treatment goals and preferences.
    A variety of tapering regimens have been recommended in guidelines – summarised here [LINK]
  </p>
  <p>
  The following approach may be considered as a general guide:
  <p>
  
  <ul>
    <li><strong>Short-term use</strong> (less than 3 months): slow dose reduction (eg 10 to 25% every week).</li>
    <li><strong>Longer-term use</strong> (more than 3 months): slower dose reduction (eg by 10 to 25% every 4 weeks). Some patients (eg those taking higher doses or for long periods of time) may need slower reductions.</li>
  </ul>

  <p>
    Closely monitor and regularly review patients during tapering, and adjust tapering plan if needed.
  </p>

  <p>
    <strong>This calculator is designed to use whole slow-release dose forms (which cannot be cut).</strong> 
    It is not designed for reducing immediate-release formulations or for complex patients (eg those with severe substance use disorder, high risk of withdrawal or symptom recurrence) – seek specialist advice for tailored tapering plans for these patients.
  </p>

  <p>
   At the later stages of a taper, the desired dose reduction may not be possible with a slow-release formulation; a short-acting opioid may be required to complete the taper or to manage withdrawal symptoms.
  </p>

  <p>
    If the patient is also taking a short-acting opioid, ensure the dose is reviewed as their total daily opioid dose reduces.
  </p>
  `,

  bzra: `
  <p>
    Tapering should occur <strong>gradually</strong> and be <strong>individualised</strong> to the person’s clinical characteristics, treatment goals and preferences. 
    Tapering recommendations in guidelines vary from 5 to 25% reductions every 1 to 4 weeks, with slower or faster tapers depending on dose and duration of use – summarised here [LINK]. 
  </p>

  <p>
  Closely monitor and regularly review patients during tapering, and adjust tapering plan if needed.
  <p>

  <p>
    <strong>This calculator is designed to use commercially available formulations in whole, half or quarter dose forms.</strong> 
    It is not designed to calculate a slower taper using compounded formulations; 
    such approaches may be required for complex patients (eg those with severe substance use disorder, high risk of withdrawal or symptom recurrence).
  </p>
  `,
  antipsychotic: `• Reduce ~25–50% every 1–2 weeks with close monitoring.
• Slower taper may be appropriate depending on symptoms.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,

  gabapentinoid: `• Reduce X% every Y weeks with close monitoring 
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE] [INSERT GUIDE TO RULESET]`,
  
  ppi: `•	Reduce dose by 50% every 1-2 weeks 
•	Step-down to lowest effective dose, alternate-day dosing, or stop and use on-demand.
•	Review at 4–12 weeks.
[INSERT ALGORITHM]  [INSERT SUMMARY OF EVIDENCE]   [INSERT GUIDE TO RULESET]`,
};

// ---- Class-specific footer copy (placeholder text) ----
const CLASS_FOOTER_COPY = {
opioids: `
<p><strong>Talk to your doctor, pharmacist or nurse before making any changes to your medicine.</strong>
This tapering plan may need to change depending on how you’re feeling.</p>
<p>If you are taking a short-acting or “when required” opioid, confirm with your healthcare professional which dose to continue during each reduction step.</p>
<strong>Discuss the following with your healthcare team:</strong>
<ul class="footer-list">
  <li>Other strategies to help manage your pain</li>
  <li>Regular review and follow-up appointments</li>
  <li>How to keep your support network informed</li>
  <li>Plans to prevent and manage withdrawal symptoms if you get any – these are temporary and usually mild, but can be distressing (e.g. flu-like symptoms, nausea, diarrhoea, stomach aches, anxiety, restlessness, sweating, fast heartbeat).</li>
</ul>
<p>See your healthcare team regularly while reducing your dose. If you have any concerns or troublesome withdrawal symptoms, speak to your prescriber about what to do.</p>
<p>Your tolerance to opioids will reduce as your dose reduces. This means <strong>you are at risk of overdosing if you quickly return to your previous high doses of opioids</strong>. Naloxone is a medication that reverses the effects of opioid overdose and may save your life. For more information, see <a href="https://saferopioiduse.com.au" target="_blank">The Opioid Safety Toolkit (https://saferopioiduse.com.au)</a> for details.</p>

<strong>Additional notes:</strong>
<textarea></textarea>
<strong>Prescriber contact details:</strong>
<textarea></textarea>
<em>This information is not intended as a substitute for medical advice and should not be exclusively relied on to diagnose or manage a medical condition. Monash University disclaims all liability (including for negligence) for any loss, damage or injury resulting from reliance on or use of this information.</em>
`,
bzra: `
<strong>Talk to your doctor, pharmacist or nurse before making any changes to your medicine.</strong>
This tapering plan may need to change depending on how you’re feeling.
<strong>Discuss the following with your healthcare team:</strong>
<ul class="footer-list">
  <li>Other strategies to help manage your insomnia</li>
  <li>Regular review and follow-up appointments</li>
  <li>How to keep your support network informed</li>
  <li>Plans to prevent and manage withdrawal symptoms if you get any – these are temporary and usually mild, but can be distressing (e.g. sleeplessness, nightmares, anxiety, restlessness, irritability, sweating, tremors, high blood pressure, fast heartbeat).</li>
</ul>
<p>See your healthcare team regularly while reducing your dose. If you have any concerns or troublesome withdrawal symptoms, speak to your prescriber about what to do.</p>
<strong>Additional notes:</strong>
<textarea></textarea>
<strong>Prescriber contact details:</strong>
<textarea></textarea>
<em>This information is not intended as a substitute for medical advice and should not be exclusively relied on to diagnose or manage a medical condition. Monash University disclaims all liability (including for negligence) for any loss, damage or injury resulting from reliance on or use of this information.</em>
`,
  antipsychotic: "Insert specific footer + disclaimer for Antipsychotics",
  ppi:           "Insert specific footer + disclaimer for Proton Pump Inhibitors",
  gabapentinoid:"Insert specific footer + disclaimer for Gabapentinoid",
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
  if (s.includes("gaba") || s.includes("gabapentin") || s.includes("pregabalin")) return "gabapentinoid";
  return null;
}

// Normalize a visible label to one of our keys above
function footerKeyFromLabel(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("opioid") || s.includes("fentanyl") || s.includes("buprenorphine")) return "opiods" || "opioids";
  if (s.includes("benzodiazep") || s.includes("z-drug") || s.includes("z drug")) return "bzra";
  if (s.includes("antipsych")) return "antipsychotic";
  if (s.includes("proton") || s.includes("ppi")) return "ppi";
  if (s.includes("gaba") || s.includes("gabapentin") || s.includes("pregabalin")) return "gabapentinoid";
  return null;
}

function updateClassFooter() {
  const cls = document.getElementById("classSelect")?.value || "";
  const key = mapClassToKey(cls); // "opioids" | "bzra" | "antipsychotic" | "ppi" | null
  const html = (key && CLASS_FOOTER_COPY[key]) || CLASS_FOOTER_COPY._default;
  const target = document.getElementById("classFooter");
  if (target) target.innerHTML = html;  // ← was textContent
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
  opioids: "Opioids for persistent noncancer pain",
  bzra: "Benzodiazepines and Z-drugs for insomnia in older adults",
  antipsychotic: "Antipsychotics",
  ppi: "Proton Pump Inhibitors",
  gabapentinoid: "Gabapentinoid"
};
  
  const text = SUGGESTED_PRACTICE[key] || "";
 box.innerHTML = `
  <h2>${titleMap[key]}</h2>
  <div class="practice-text">
    ${text}
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

//#endregion

//#region 7) Dose Text & Fraction Helpers
/* ===== digits/words helpers (fractional → words incl. whole) ===== */
function _smallIntToWords(n) {
  const map = {0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten'};
  return map[n] ?? String(n);
}
function qToCell(q){ // q = quarters of a tablet (for table cells)
  if (q == null || q === "") return "";
  const tabs = q / 4;  // convert quarters → tablets, e.g. 2 → 0.5, 6 → 1.5
  if (!Number.isFinite(tabs)) return "";
  // Format to at most 2 decimal places, then strip trailing zeros
  let s = tabs.toFixed(2);            // e.g. "0.50", "1.25", "2.00"
  s = s.replace(/\.00$/, "");         // "2.00" → "2"
  s = s.replace(/(\.\d)0$/, "$1");    // "1.50" → "1.5"
  return s;                           // e.g. "0.5", "0.25", "1.25"
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
function unitsPhraseDigits(q, unit){
  // Reuse tabletsPhraseDigits wording, but swap "tablet(s)" for the requested unit
  const base = tabletsPhraseDigits(q);
  const u = String(unit || "tablet").toLowerCase();
  if (u === "tablet") return base;

  const plural = u.endsWith("s") ? u : u + "s";

  // Replace plurals first, then singular to avoid "capsuless"
  return base
    .replace(/tablets/gi, plural)
    .replace(/tablet/gi, u);
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
//#endregion

//#region 8) Dose-form Nouns & Labels
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

//#endregion
//#region 5. Renderers (Standard & Patch)
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
  ["Date beginning","Strength","Instructions","Morning","Midday","Evening","Night"].forEach(t=>{
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

      // [2] Strength  — keep label tied to selected formulations (no phantom lower strengths)
      const tdStrength = document.createElement("td");
      tdStrength.className = "col-strength";
      const cls  = $("classSelect")?.value || "";
      const med  = $("medicineSelect")?.value || "";
      const form = $("formSelect")?.value || "";
      const rawLabel = line.strengthLabel || line.strength || "";
      tdStrength.textContent = prettySelectedLabelOrSame(cls, med, form, rawLabel);
      tr.appendChild(tdStrength);


       // [3] Instructions — put each "Take ..." on its own line
      const tdInstr = document.createElement("td");
      tdInstr.className = "col-instr instructions-pre";
      const instrText = String(line.instr || "").replace(/\s+(?=Take\b)/g, '\n');
      tdInstr.textContent = instrText;
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
const CLASS_ORDER = ["Opioid","Benzodiazepine / Z-Drug (BZRA)","Antipsychotic","Proton Pump Inhibitor","Gabapentinoid"];

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
  "Benzodiazepine / Z-Drug (BZRA)": {
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
    Olanzapine: { Tablet: ["2.5 mg","5 mg","7.5 mg","10 mg"] },
    Quetiapine: { "Immediate Release Tablet": ["25 mg","100 mg"]},
    Risperidone: { Tablet: ["0.5 mg","1 mg","2 mg"] },
  },
  "Proton Pump Inhibitor": {
    Esomeprazole: { Tablet: ["20 mg","40 mg"] },
    Lansoprazole: { "Orally Dispersible Tablet": ["15 mg","30 mg"], Tablet: ["15 mg","30 mg"] },
    Omeprazole: { Capsule: ["10 mg","20 mg"], Tablet: ["10 mg","20 mg"] },
    Pantoprazole: { Tablet: ["20 mg","40 mg"] },
    Rabeprazole: { Tablet: ["10 mg","20 mg"] },
  },
  "Gabapentinoid": {
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
const AP_ROUND = { Haloperidol: 0.5, Risperidone: 0.25, Quetiapine: 12.5, Olanzapine: 1.25 };

/* =================== Parsing/labels =================== */

function isMR(form){ return /slow\s*release|modified|controlled|sustained/i.test(form) || /\b(SR|MR|CR|ER|XR|PR|CD)\b/i.test(form); }
function formLabelCapsSR(form){ return String(form||"").replace(/\bsr\b/ig,"SR"); }
function parseMgFromStrength(s){ const m = String(s||"").match(/^\s*([\d.]+)\s*(?:mg)?(?:\s*\/|$)/i); return m ? parseFloat(m[1]) : 0; }
function parsePatchRate(s){const str = String(s || "");const m = str.match(/([\d.]+)\s*mcg\s*\/\s*h(?:r)?/i);if (m) return parseFloat(m[1]);const n = parseFloat(str.replace(/[^\d.]/g, ""));return Number.isFinite(n) ? n : 0;}
function stripZeros(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/,"");
}

function oxyNxPairLabel(oxyMg){
  const oxy = +oxyMg;
  const nx  = +(oxy/2);
  return `Oxycodone ${stripZeros(oxy)} mg + naloxone ${stripZeros(nx)} mg SR tablet`;
}
/* =================== Dropdowns & dose lines =================== */
function populateClasses() {
  const el = $("classSelect");
  if (!el) return;

  // Keep current selection if possible
  const current = el.value;

  el.innerHTML = "";

  // General per-class mode: "show" | "hide" | "disable"
  // Default is "show"
  const CLASS_MODE = {
    "Opioid": "show",
    "Benzodiazepine / Z-Drug (BZRA)": "show",
    "Antipsychotic": "show",
    "Proton Pump Inhibitor": "show",
    "Gabapentinoid": "show",
  };

  CLASS_ORDER.forEach(c => {
    // only add classes that exist in the catalog
    if (!CATALOG[c]) return;

    const mode = CLASS_MODE[c] || "show";
    if (mode === "hide") return; // skip entirely

    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;

    if (mode === "disable") {
      o.disabled = true; // visible but cannot be chosen
    }

    el.appendChild(o);
  });

  // Restore selection if still available and not hidden
  const restoredOption = Array.from(el.options).find(o => o.value === current && !o.disabled);
  if (restoredOption) {
    el.value = current;
  } else {
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

// Helper: read Benzodiazepine quarter-tablet toggle (if present in the UI)
function isBzraQuarterAllowed(){
  const yes = document.getElementById("bzraQuarterYes");
  if (!yes) return false; // default: quarters off if control not present
  return !!yes.checked;
}


/* splitting rules */
function canSplitTablets(cls, form, med){
  const f = String(form || "");
  const isModified =
    (typeof isMR === "function" && isMR(form)) ||
    /(?:^|\W)(sr|cr|er|mr)(?:\W|$)/i.test(f); // fallback MR detection
  // Forms that must never be split
  if (/Patch|Capsule|Orally\s*Dispersible\s*Tablet/i.test(f) || isModified) {
    return { half:false, quarter:false };
  }
  // Classes that never split
  if (cls === "Opioid" || cls === "Proton Pump Inhibitor" || cls === "Gabapentinoid") {
    return { half:false, quarter:false };
  }
  // BZRA: plain tablets can be split; quartering depends on the toggle
  if (cls === "Benzodiazepine / Z-Drug (BZRA)") {
    const nonSplittable = /odt|wafer|dispers/i.test(f); // extra guard, though blocked above
    if (nonSplittable) return { half:false, quarter:false };
    const allowQuarter = (typeof isBzraQuarterAllowed === "function" && isBzraQuarterAllowed());
    return { half:true, quarter:allowQuarter };
  }
  // Antipsychotics: plain IR tablets can be halved (no quarters)
  if (cls === "Antipsychotic" && /Tablet/i.test(f)) {
    return { half:true, quarter:false };
  }
  // Default (rare fallback)
  return { half:true, quarter:true };
}


/* default frequency */
function defaultFreq(){
  const cls = $("classSelect")?.value;
  const form = $("formSelect")?.value;
  const med = $("medicineSelect")?.value;

  if (form === "Patch") return "PATCH";
  if (cls === "Benzodiazepine / Z-Drug (BZRA)") return "PM";
  if (cls === "Proton Pump Inhibitor") return "DIN";
  if (cls === "Gabapentinoid") {
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
    } else if(cls==="Benzodiazepine / Z-Drug (BZRA)"){
      const o=document.createElement("option"); o.value="PM"; o.textContent="Daily at night";
      fSel.appendChild(o); fSel.disabled=true;
    } else if(cls==="Opioid" || cls==="Antipsychotic" || cls==="Proton Pump Inhibitor" || cls==="Gabapentinoid"){
      [
        ["AM","In the morning"],["MID","At midday"],["DIN","In the evening"],["PM","At night"],
        ["BID","Twice a day (morning & night)"],["TID","Three times a day"],["QID","Four times a day"]
      ].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=false;
    } else {
      [["AM","Daily in the morning"],["MID","Daily at midday"],["DIN","Daily in the evening"],["PM","Daily at night"]]
        .forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=false;
    }
    fSel.value=ln.freqMode || defaultFreq();

    sSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.strengthStr=e.target.value; setDirty(true); };
    fSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.freqMode=e.target.value; setDirty(true); };

// Quantity constraints per form (no hard caps; snap to allowed step)
const qtyInput = row.querySelector(".dl-qty");

// Better mobile keypad + lower bound
qtyInput.inputMode = "decimal";
qtyInput.min = 0;

// Decide the allowed increment ("step")
let step;
if (/Patch/i.test(form)) {
  // Patches: whole-only
  step = 1;
} else if (/SR/i.test(form)) {
  // SR tablets: whole-only
  step = 1;
} else {
  // Others: allow halves (or quarters if your split rules permit)
  const split = (typeof canSplitTablets === "function")
    ? canSplitTablets(cls, form, med)   // keep your existing signature/order
    : { half: true, quarter: false };

  step = split.quarter ? 0.25 : (split.half ? 0.5 : 1);
}

// Remove any upper cap and set step
qtyInput.removeAttribute("max");
qtyInput.step = String(step);

// Initial value (keep existing if present, otherwise 1 or a single step)
qtyInput.value = (typeof ln.qty !== "undefined")
  ? ln.qty
  : (step < 1 ? step : 1);

// Shared snapper (no negatives, snap to step, keep sensible precision)
const sanitizeQty = (val) => {
  let v = parseFloat(val);
  if (!Number.isFinite(v)) v = 0;
  v = Math.max(0, Math.round(v / step) * step);
  if (step === 0.25) return Math.round(v * 4) / 4;
  if (step === 0.5)  return Math.round(v * 2) / 2;
  return Math.round(v);
};

// Only sanitize after editing (no cursor jumping)
qtyInput.addEventListener("blur", () => {
  qtyInput.value = sanitizeQty(qtyInput.value);
});

qtyInput.addEventListener("change", (e) => {
  const id = +e.target.dataset.id;
  const v  = sanitizeQty(e.target.value);
  e.target.value = v;

  const l = doseLines.find(x => x.id === id);
  if (l) l.qty = v;

  setDirty(true);
});


    row.querySelector(".dl-remove").onclick=(e)=>{ const id=+e.target.dataset.id; doseLines=doseLines.filter(x=>x.id!==id); renderDoseLines(); setDirty(true); };
  });
}

/* =================== Suggested practice header =================== */

function specialInstructionFor(){
  const cls=$("classSelect")?.value || "";
  const med=$("medicineSelect")?.value || "";
  const form=$("formSelect")?.value || "";

  if(cls==="Benzodiazepine / Z-Drug (BZRA)" || cls==="Antipsychotic") return "";

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
  if (split.half)    uniq.forEach(v => pieces.push(+(v/2).toFixed(4)));
  if (split.quarter) uniq.forEach(v => pieces.push(+(v/4).toFixed(4)));
  return [...new Set(pieces)].sort((a,b)=>a-b);
}

function lowestStepMg(cls, med, form){
  // BZRA: align with the BZRA-specific grid logic so step size and composition
  // use the same smallest piece (LCS + quarter toggle).
  if (cls === "Benzodiazepins / Z-Drug (BZRA)") {
    // Zolpidem MR stays on its fixed 6.25 mg grid
    if (/Zolpidem/i.test(med) && isMR(form)) return 6.25;

    // Otherwise, use the same grid as the BZRA taper
    if (typeof selectionGridStepBZRA === "function") {
      const grid = selectionGridStepBZRA(med, form, null); // null ⇒ treat as "all products"
      if (grid && grid > 0) return grid;
    }

    // Fallback if grid helper fails for some reason
    if (BZRA_MIN_STEP[med]) return BZRA_MIN_STEP[med];
  }

  // Antipsychotics: existing rounding rules
  if (cls === "Antipsychotic" && !isMR(form) && AP_ROUND[med]) {
    return AP_ROUND[med];
  }

  // All other classes: base strength adjusted for splitting
  const mg = strengthsForSelected()
    .map(parseMgFromStrength)
    .filter(v => v > 0)
    .sort((a,b) => a - b)[0] || 0;

  const split = canSplitTablets(cls, form, med);
  return split.quarter ? +(mg/4).toFixed(3)
       : split.half   ? +(mg/2).toFixed(3)
                      : mg;
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

  if($("classSelect").value==="Benzodiazepine / Z-Drug (BZRA)"){ packs.AM={}; packs.MID={}; packs.DIN={}; }
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

/* === BZRA selection-only composer (PM-only). LCS-based splitting, whole > half > quarter === */
function composeForSlot_BZRA_Selected(targetMg, cls, med, form, selectedMg){
  // Require a positive target
  if (!(targetMg > 0)) return {};

  // Normalise the mg list
  let mgList = Array.isArray(selectedMg) ? selectedMg.slice() : [];
  mgList = mgList
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a,b)=>a-b);
  if (!mgList.length) return null;

  // Check global splitting rules for this class / med / form
  let allowHalf = false;
  let allowQuarter = false;
  if (typeof canSplitTablets === "function") {
    const rule = canSplitTablets(cls, form, med) || {};
    allowHalf    = !!rule.half;
    allowQuarter = !!rule.quarter;
  }

  // Lowest commercial strength (LCS) defines the grid and which strength we split
  const lcs = +mgList[0].toFixed(3);

  // Build units:
  // - whole tablets for all strengths
  // - half/quarter only from LCS
  const units = [];
  for (const mg of mgList){
    const m = +Number(mg).toFixed(4);
    if (!(m > 0)) continue;

    // Whole tablet always allowed
    units.push({ unit: m, source: m, piece: 1.0 });

    // Only split the LCS (this keeps the grid consistent)
    if (m === lcs && allowHalf) {
      const halfUnit = +(m / 2).toFixed(4);      // was toFixed(3)
      units.push({ unit: halfUnit, source: m, piece: 0.5 });

      if (allowQuarter) {
        const quarterUnit = +(m / 4).toFixed(4); // was toFixed(3)
        units.push({ unit: quarterUnit, source: m, piece: 0.25 });
      }
    }
  }

  if (!units.length) return null;

  // Prefer whole > half > quarter, then larger strengths within each
  units.sort((a,b)=>{
    if (b.piece !== a.piece) return b.piece - a.piece; // 1.0 > 0.5 > 0.25
    return b.unit - a.unit;                            // within that, larger mg first
  });

  // Greedy pack into PM, crediting pieces to their source strength
  let r = +targetMg.toFixed(6);
  const PM = {};
  for (const u of units){
    if (r <= EPS) break;
    const q = Math.floor(r / u.unit + 1e-9);
    if (q > 0){
      PM[u.source] = (PM[u.source] || 0) + q * u.piece;
      r -= q * u.unit;
      r = +r.toFixed(6);
    }
  }

  // If we can't hit the target exactly with these units, let the caller fall back
  if (r > EPS) return null;
  return PM;
}

// Selection-aware AP composer with safe fallback to "all"
function composeForSlot_AP_Selected(targetMg, cls, med, form){
  let sel = [];
  try {
    if (typeof selectedProductMgs === "function") {
      sel = (selectedProductMgs() || [])
        .map(Number)
        .filter(n => Number.isFinite(n) && n > 0)
        .sort((a,b)=>a-b);
    }
  } catch(_) {}
  if (!sel.length) return composeForSlot(targetMg, cls, med, form);
  const pack = (typeof composeForSlot_BZRA_Selected === "function")
    ? composeForSlot_BZRA_Selected(targetMg, cls, med, form, sel)
    : null;
  return pack || composeForSlot(targetMg, cls, med, form);
}

/* ===== Preferred BID split (robust + hardened; never single-slot unless total < 2*q) ===== */
function preferredBidTargets(total, cls, med, form){
  const EPS = 1e-9;

  // Helpers
  const isNum = (x) => Number.isFinite(x);
  const clampGrid = (x, q) => Math.max(0, Math.round(x / q) * q);

  // Read rules
  const stepMinRaw = (typeof lowestStepMg       === "function" ? lowestStepMg(cls, med, form)       : 1);
  const qRaw       = (typeof effectiveQuantumMg === "function" ? effectiveQuantumMg(cls, med, form) : stepMinRaw);

  // Preference (global source of truth)
  const pref = (typeof getBidHeavierPreference === "function") ? getBidHeavierPreference() : "PM";

  // --- Sanitise inputs (CRITICAL to prevent NaNs / freezes) ---
  let stepMin = isNum(stepMinRaw) && stepMinRaw > 0 ? stepMinRaw : 1;
  let q       = isNum(qRaw)       && qRaw       > 0 ? qRaw       : stepMin;
  if (!(isNum(q) && q > 0)) q = 1;               // last-resort floor
  if (!(isNum(stepMin) && stepMin > 0)) stepMin = q;

  // Safe divide (avoids NaN/Inf if q ever drifted)
  const sdiv = (a,b) => (isNum(a) && isNum(b) && b !== 0) ? (a / b) : 0;

  total = isNum(total) ? total : 0;
  total = Math.max(0, Math.round(sdiv(total, q)) * q); // snap safely to grid

  // Trivial cases
  if (total <= 0) return { AM:0, PM:0 };
  if (total < 2*q){
    // Not enough to support BID; return single-slot on preferred side
    return (pref === "AM") ? { AM: total, PM: 0 } : { AM: 0, PM: total };
  }

  // Start from an even split on the grid
  let am = Math.floor(sdiv(total, 2) / q) * q; // ≤ total/2, integer multiples of q
  let pm = total - am;
  pm = clampGrid(pm, q);
  am = total - pm;

  // Enforce heavier-side preference (when unequal)
  if (am !== pm) {
    const amHeavier = am > pm;
    if (pref === "PM" && amHeavier) { const t = am; am = pm; pm = t; }
    if (pref === "AM" && !amHeavier){ const t = am; am = pm; pm = t; }
  }

  // Cap difference to ≤ lowest selected strength
  const cap = stepMin;
  let diff = Math.abs(pm - am);
  if (diff > cap) {
    const targetLight = (pm >= am) ? "AM" : "PM";   // move from heavier → lighter
    let guard = 64;                                 // hard cap to prevent runaway loops
    while (diff > cap && guard-- > 0) {
      if (targetLight === "AM" && pm - q >= 0) { pm -= q; am += q; }
      else if (targetLight === "PM" && am - q >= 0) { am -= q; pm += q; }
      else break;
      diff = Math.abs(pm - am);
    }
  }

  // Final guard: forbid single-slot when BID is possible
  if ((am === 0 || pm === 0) && total >= 2*q) {
    if (pref === "AM") { am = q; pm = total - q; }
    else               { pm = q; am = total - q; }

    // Re-apply cap with a guard
    let guard = 64;
    while (Math.abs(pm - am) > stepMin && guard-- > 0) {
      if (pm >= am && pm - q >= 0) { pm -= q; am += q; }
      else if (am > pm && am - q >= 0) { am -= q; pm += q; }
      else break;
    }
  }

  // Snap to grid one last time
  am = clampGrid(am, q);
  pm = clampGrid(pm, q);

  // Safety: keep sums exact to total if tiny drift happened
  const drift = (am + pm) - total;
  if (Math.abs(drift) >= q - EPS) {
    // If something is badly off, just rebuild to preferred minimal split
    if (pref === "AM") { am = q; pm = total - q; }
    else               { pm = q; am = total - q; }
  } else if (Math.abs(drift) >= EPS) {
    // Nudge the heavier side down by the drift
    if (pm >= am && pm - drift >= 0) pm -= drift;
    else if (am > pm && am - drift >= 0) am -= drift;
  }

  // Final snap
  am = clampGrid(am, q);
  pm = clampGrid(pm, q);

  // === FINAL re-assertion of heavier-side preference (after all nudges/snaps) ===
  if (am !== pm) {
    const amHeavier = am > pm;
    if (pref === "PM" && amHeavier) { const t = am; am = pm; pm = t; }
    if (pref === "AM" && !amHeavier){ const t = am; am = pm; pm = t; }

    // ensure the difference cap still holds (one guarded pass)
    if (Math.abs(pm - am) > stepMin) {
      let guard = 8;
      while (Math.abs(pm - am) > stepMin && guard-- > 0) {
        if (pm >= am && pm - q >= 0) { pm -= q; am += q; }
        else if (am > pm && am - q >= 0) { am -= q; pm += q; }
        else break;
      }
      // snap again for safety
      am = Math.max(0, Math.round(am / q) * q);
      pm = Math.max(0, Math.round(pm / q) * q);
    }
  }

  return { AM: am, PM: pm };
}

/* ===== Opioids (tablets/capsules) — BID grid search + shave fallback ===== */
function stepOpioid_Shave(packs, percent, cls, med, form){
  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // ----- tiny utilities -----
  const toMg = (v) => {
    if (typeof v === "number") return v;
    if (typeof parseMgFromStrength === "function") {
      const x = parseMgFromStrength(v);
      if (Number.isFinite(x)) return x;
    }
    const m = String(v).match(/([\d.]+)\s*mg/i);
    return m ? parseFloat(m[1]) : NaN;
  };

  function commercialStrengthsMg(){
    try {
      if (typeof strengthsForPicker === "function") {
        const arr = strengthsForPicker(cls, med, form) || [];
        const mg = arr
          .map(toMg)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        return Array.from(new Set(mg));
      }
    } catch (_) {}
    try {
      const cat  = (window.CATALOG?.[cls]?.[med]) || {};
      const pool = (form && cat[form]) ? cat[form] : Object.values(cat).flat();
      const mg   = (pool || [])
        .map(toMg)
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      return Array.from(new Set(mg));
    } catch (_) {}
    return [];
  }

  function selectedStrengthsMg(){
    try {
      if (window.SelectedFormulations && SelectedFormulations.size > 0) {
        return Array.from(SelectedFormulations)
          .map(toMg)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
      }
      if (typeof selectedProductMgs === "function") {
        const arr = selectedProductMgs() || [];
        return arr
          .map(toMg)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
      }
    } catch (_) {}
    return [];
  }

  const catalog = commercialStrengthsMg();
  const lcs     = catalog.length ? catalog[0] : NaN;            // lowest commercial strength
  const selList = selectedStrengthsMg();
  const pickedAny      = selList.length > 0;
  const lcsSelected    = pickedAny ? selList.some((mg) => Math.abs(mg - lcs) < 1e-9) : true; // none selected ⇒ treat as all
  const selectedMinMg  = pickedAny ? selList[0] : lcs;          // selected minimum (or lcs if none selected)
  const thresholdMg    = lcsSelected ? lcs : selectedMinMg;     // endpoint threshold we test against

  const AM  = slotTotalMg(packs, "AM");
  const MID = slotTotalMg(packs, "MID");
  const DIN = slotTotalMg(packs, "DIN");
  const PM  = slotTotalMg(packs, "PM");

  const isExactBIDAt = (mg) =>
    Number.isFinite(mg) &&
    Math.abs(AM - mg) < EPS &&
    Math.abs(PM - mg) < EPS &&
    MID < EPS &&
    DIN < EPS;

  function isExactSingleOnlyAt(mg){
    const pref = (typeof getBidHeavierPreference === "function" && getBidHeavierPreference() === "AM") ? "AM" : "PM";
    const amOk = (pref === "AM") ? Math.abs(AM - mg) < EPS : AM < EPS;
    const pmOk = (pref === "PM") ? Math.abs(PM - mg) < EPS : PM < EPS;
    return Number.isFinite(mg) && amOk && pmOk && MID < EPS && DIN < EPS;
  }

  // ----- BID end-sequence gate (preference-aware) -----
  if (Number.isFinite(thresholdMg)) {
    // Already at single-dose (AM-only or PM-only by preference) ⇒ STOP
    if (isExactSingleOnlyAt(thresholdMg)) {
      if (window._forceReviewNext) window._forceReviewNext = false;
      return {}; // empty packs ⇒ buildPlanTablets() prints STOP row
    }

    // First time we hit exact BID at threshold
    if (isExactBIDAt(thresholdMg)) {
      if (lcsSelected) {
        // LCS among selected ⇒ emit single-dose at threshold per preference (no rebalancing)
        if (window._forceReviewNext) window._forceReviewNext = false;
        const pref = (typeof getBidHeavierPreference === "function" && getBidHeavierPreference() === "AM") ? "AM" : "PM";
        const cur = { AM: 0, MID: 0, DIN: 0, PM: 0 };
        cur[pref] = thresholdMg;
        return recomposeSlots(cur, cls, med, form);
      } else {
        // LCS not selected ⇒ Review next boundary
        window._forceReviewNext = true;
        return packs; // unchanged; loop will schedule Review
      }
    }
  }

  const isPureBID = MID < EPS && DIN < EPS;

  // ===== NEW: pure BID taper logic for opioids (AM + PM only) =====
  if (isPureBID) {
    const EPS_LOCAL = 1e-9;

    function baseQuantumMg(){
      // Per-medicine base quantum (LCS) as agreed
      if (cls === "Opioid") {
        if (/Morphine/i.test(med)) return 5;
        if (/Oxycodone\s*\/\s*Naloxone/i.test(med)) return 2.5;
        if (/Oxycodone/i.test(med)) return 5;
        if (/Tapentadol/i.test(med)) return 50;
        if (/Tramadol/i.test(med)) return 50;
      }
      if (/Pregabalin/i.test(med) || cls === "Gabapentinoid") return 25;
      if (Number.isFinite(lcs) && lcs > 0) return lcs;
      const fallback = (typeof lowestStepMg === "function" ? lowestStepMg(cls, med, form) : 1);
      return fallback || 1;
    }

    const q = baseQuantumMg();
    const raw = tot * (1 - percent / 100);

    if (!Number.isFinite(raw) || raw <= 0) {
      if (typeof window !== "undefined") window._forceReviewNext = true;
      return packs;
    }

    const snapUp = (x) => Math.max(0, Math.ceil(x / q) * q);

    // Helper: test whether a total is exactly buildable as BID using selected products
    function tryBuildTotal(targetTotal){
      if (!Number.isFinite(targetTotal) || targetTotal <= 0) return null;
      if (typeof recomposeSlots !== "function" || typeof packsTotalMg !== "function") return null;

      const pref = (typeof getBidHeavierPreference === "function" ? getBidHeavierPreference() : "PM");

      // Generate all AM/PM splits on the quantum grid with both sides > 0
      const splits = [];
      for (let am = q; am <= targetTotal - q; am += q) {
        const pmSplit = targetTotal - am;
        if (pmSplit <= 0) continue;
        splits.push({ AM: am, PM: pmSplit });
      }
      if (!splits.length) return null;

      // Sort by closeness (|AM-PM|), then by heavier side preference
      splits.sort((a, b) => {
        const da = Math.abs(a.AM - a.PM);
        const db = Math.abs(b.AM - b.PM);
        if (da !== db) return da - db;

        if (pref === "PM") {
          const aGood = a.PM >= a.AM;
          const bGood = b.PM >= b.AM;
          if (aGood !== bGood) return aGood ? -1 : 1;
        } else if (pref === "AM") {
          const aGood = a.AM >= a.PM;
          const bGood = b.AM >= b.PM;
          if (aGood !== bGood) return aGood ? -1 : 1;
        }
        return 0;
      });

      for (const split of splits) {
        const slots = { AM: split.AM, MID: 0, DIN: 0, PM: split.PM };
        const rec = recomposeSlots(slots, cls, med, form);
        const achieved = packsTotalMg(rec);
        // must be an exact match AND a true reduction
        if (Math.abs(achieved - targetTotal) < EPS_LOCAL && achieved < tot - EPS_LOCAL) {
          return rec;
        }
      }
      return null;
    }

    let nextPacks = null;

    // 1) Search UPWARDS from the snapped-up target, staying below the current dose
    let candidate = snapUp(raw);
    if (candidate >= tot - EPS_LOCAL) {
      candidate = Math.max(0, tot - q);
    }

    for (let t = candidate; t < tot - EPS_LOCAL; t += q) {
      nextPacks = tryBuildTotal(t);
      if (nextPacks) break;
    }

    // 2) If no upward candidate is reachable, search DOWNWARDS (1A + 2A behaviour)
    if (!nextPacks) {
      for (let t = tot - q; t > 0; t -= q) {
        nextPacks = tryBuildTotal(t);
        if (nextPacks) break;
      }
    }

    if (nextPacks) {
      if (typeof window !== "undefined" && window._forceReviewNext) window._forceReviewNext = false;
      return nextPacks;
    }

    // 3) No reachable lower total with the selected products:
    // flag a Review rather than inventing a ghost dose step.
    if (typeof window !== "undefined") {
      window._forceReviewNext = true;
    }
    return packs;
  }

  // ===== Non-BID fallback: original shave logic for patterns with MID / DIN =====
  const step = lowestStepMg(cls, med, form) || 1;
  const q = (typeof effectiveQuantumMg === "function" ? effectiveQuantumMg(cls, med, form) : step) || step;

  // ALWAYS ROUND UP to the quantum
  let target = Math.ceil((tot * (1 - percent / 100)) / q) * q;

  // Anti-stall: if "up" keeps us at the same dose or above, step down one quantum
  if (target >= tot - EPS && tot > 0) {
    target = Math.max(0, tot - q);
  }

  let cur = { AM, MID, DIN, PM };
  let reduce = +(tot - target).toFixed(3);

  const shave = (slot) => {
    if (reduce <= EPS || cur[slot] <= EPS) return;
    const can = cur[slot];
    const dec = Math.min(can, floorTo(reduce, step));  // never remove more than 'reduce'
    if (dec <= 0) return;
    cur[slot] = +(cur[slot] - dec).toFixed(3);
    reduce    = +(reduce    - dec).toFixed(3);
  };

  // SR-style: reduce DIN first; then MID
  if (cur.DIN > EPS) {
    shave("DIN");
    shave("MID");
  } else {
    shave("MID");
  }

  // Rebalance across AM/PM if reduction remains
  if (reduce > EPS) {
    const bidTarget = Math.max(0, +(cur.AM + cur.PM - reduce).toFixed(3));
    const bid = preferredBidTargets(bidTarget, cls, med, form);
    cur.AM = bid.AM;
    cur.PM = bid.PM;
    reduce = 0;
  }

  // tidy negatives to zero
  for (const k of ["AM", "MID", "DIN", "PM"]) {
    if (cur[k] < EPS) cur[k] = 0;
  }

  // Compose using selected products (keeps "fewest units" rules etc.)
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

/* ===== Antipsychotics (IR only): Olanzapine / Quetiapine (plain) / Risperidone =====
   Rules:
   - Scope: Olanzapine (IR), Quetiapine (IR/plain), Risperidone (IR/tablet). No SR/XR. No Haloperidol.
   - Next total = previous_total * (1 - percent), then snap to fixed grid:
       Quetiapine 12.5 mg, Risperidone 0.25 mg, Olanzapine 1.25 mg.
   - Tie on snapping → fewest units (i.e., lower total), then round up.
   - Reduction is shaved strictly in the user chip order (no fallback).
   - Progress guard: if snap repeats total, force -1 grid unit from first eligible chip.
   - Recompose per-slot using existing catalogue/selection; no phantom strengths.
*/
function stepAP(packs, percent, med, form){
  // --- scope gates ---
  const name = String(med || "");
  if (!/^(Olanzapine|Quetiapine|Risperidone)$/i.test(name)) return packs;
  if (typeof isMR === "function" && isMR(form)) return packs; // IR only

  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // --- fixed grids (halves only) ---
  const GRID = { Quetiapine: 12.5, Risperidone: 0.25, Olanzapine: 1.25 };
  const step = GRID[name] || 0.5;

  // --- read chip order (strict; no fallback) ---
  let order = [];
  if (typeof apGetReductionOrder === "function") {
    order = apGetReductionOrder() || [];
  } else {
    // DOM read (left→right)
    order = [...document.querySelectorAll("#apOrder .ap-chip")].map(ch => ch.getAttribute("data-slot"));
  }
  if (!order.length) {
    console.warn("[stepAP] Reduction order chips not found; aborting step.");
    return packs; // do nothing rather than guess
  }

  // --- compute next total and snap to grid with our tie-breaks ---
  const rawNext = tot * (1 - percent/100);
  const down = Math.floor(rawNext/step) * step;
  const up   = Math.ceil (rawNext/step) * step;

  function chooseByFewestUnits(a,b,target){
    const da = Math.abs(target - a), db = Math.abs(b - target);
    if (da < db) return a;
    if (db < da) return b;
    // tie: prefer fewer units → lower total, if still tie choose up
    if (a !== b) return Math.min(a,b);
    return b;
  }
  let target = chooseByFewestUnits(down, up, rawNext);

  // progress guard
  if (Math.abs(target - tot) <= EPS && tot > 0) {
    target = roundTo(Math.max(0, tot - step), step);
  }

  // --- current per-slot mg snapshot ---
  const cur = {
    AM:  +(slotTotalMg(packs,"AM")  || 0),
    MID: +(slotTotalMg(packs,"MID") || 0),
    DIN: +(slotTotalMg(packs,"DIN") || 0),
    PM:  +(slotTotalMg(packs,"PM")  || 0),
  };

  // --- shave strictly in chip order ---
  let reduce = +(tot - target).toFixed(6);
  const minDec = step;

  const slotKeyFromChip = (chipSlot) => {
    // chips are data-slot="AM|MID|DIN|PM"
    const k = String(chipSlot || "").toUpperCase();
    return (k === "AM" || k === "MID" || k === "DIN" || k === "PM") ? k : null;
  };

  // subtract up to 'reduce' from the slot, honoring grid
  function shaveOne(slot){
    if (reduce <= EPS) return;
    const avail = cur[slot];
    if (avail <= EPS) return;

    // attempt to remove as much as possible from this slot
    const want = Math.min(avail, reduce);
    let dec = roundTo(want, step);

    // ensure we make progress in this slot
    if (dec < EPS) {
      // if we rounded to 0 but there is enough to take one grid step, do it
      if (avail >= minDec) dec = minDec;
      else dec = avail; // last tiny remainder
    }
    dec = Math.min(dec, avail, reduce);

    cur[slot] = +(cur[slot] - dec).toFixed(6);
    reduce    = +(reduce    - dec).toFixed(6);
  }

  // loop passes over the order until we've removed full reduction (guarded)
  let guard = 100;
  while (reduce > EPS && guard-- > 0) {
    for (const chip of order) {
      const s = slotKeyFromChip(chip);
      if (s) shaveOne(s);
      if (reduce <= EPS) break;
    }
  }

  // snap slots to grid; clean tiny negatives
  for (const k of ["AM","MID","DIN","PM"]) {
    cur[k] = roundTo(Math.max(0, cur[k]), step);
    if (cur[k] < EPS) cur[k] = 0;
  }

  // reconcile any drift so sum == target by nudging the last chip slot
  const sum = +(cur.AM + cur.MID + cur.DIN + cur.PM).toFixed(6);
  let diff = +(target - sum).toFixed(6); // positive → need to add back (rare), negative → remove extra
  if (Math.abs(diff) > EPS) {
    const last = slotKeyFromChip(order[order.length - 1]) || "PM";
    cur[last] = roundTo(Math.max(0, cur[last] + diff), step);
  }

    // --- compose tablets from these per-slot mg, using the selection-aware packer ---
  // Build the list of selected base strengths (mg) to constrain packing
  const selectedMg = (typeof selectedProductMgs === "function")
    ? (selectedProductMgs() || [])
        .map(v => (typeof v === "number" ? v : (String(v).match(/(\d+(\.\d+)?)/)||[])[1]))
        .map(Number)
        .filter(n => Number.isFinite(n) && n > 0)
        .sort((a,b)=>a-b)
    : [];

// --- recompose each slot using selection-aware wrapper with fallback ---
return (function recomposeSlots_AP(slots){
  const out = { AM:{}, MID:{}, DIN:{}, PM:{} };
  for (const k of ["AM","MID","DIN","PM"]) {
    const mg = +(slots[k] || 0);
    out[k] = mg > 0 ? (composeForSlot_AP_Selected(mg, "Antipsychotic", med, form) || {}) : {};
  }
  return out;
})(cur);
}


/* ===== Gabapentinoid
   Gabapentin:
     • Modes:
       (a) TID: AM+MID+PM
       (b) TID (AM+DIN+PM when no MID input): treat DIN as the middle dose
       (c) QID: AM+MID+DIN+PM → shave DIN first each step, then pivot to TID when DIN=0
     • Distribution goal (TID-modes): keep doses as close as possible
       Primary: minimise range (max−min), then minimise total deviation from mean (|slot−S/3| sum),
       then enforce PM ≥ AM ≥ MID, prefer AM=PM, then fewest units, then round up, then lower S.
     • End-sequence (TID only):
       - If 100 mg is selected: 300→200→100→Stop as (100/100/100) → (100 AM + 100 PM) → (100 PM only) → Stop
       - If 100 mg is NOT selected: at first TID of lowest selected strength → Review next boundary
   Pregabalin:
     • Mirror SR-opioid BID stepper untouched
   ===== */

function stepGabapentinoid(packs, percent, med, form){
  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // ---- Pregabalin: reuse your proven BID stepper ----
  if (/pregabalin/i.test(med)) {
    if (typeof stepOpioid_Shave === 'function') return stepOpioid_Shave(packs, percent, "Opioids", med, form);
    if (typeof stepOpioidOral  === 'function')   return stepOpioidOral (packs, percent, "Opioids", med, form);
    if (typeof stepOpioid      === 'function')   return stepOpioid     (packs, percent, "Opioids", med, form);
    return packs;
  }

  // ---- Gabapentin ----
  const strengths = getSelectedStrengths();                 // strictly from selection (fallback to picker if none)
  if (!strengths.length) return packs;
  const stepMg = strengths[0];                              // quantisation step = smallest selected
  const has100 = (stepMg === 100);
  const lss    = strengths[0];                              // lowest selected strength
  const cap = Number.POSITIVE_INFINITY;

  // Detect mode based on achieved packs
  const AMmg = slotTotalMg(packs, "AM")  | 0;
  const MIDmg= slotTotalMg(packs, "MID") | 0;
  const DINmg= slotTotalMg(packs, "DIN") | 0;
  const PMmg = slotTotalMg(packs, "PM")  | 0;

  const isQID          = (MIDmg > EPS && DINmg > EPS);
  const isTID_mid      = (MIDmg > EPS && DINmg <= EPS);
  const isTID_dinAsMid = (DINmg > EPS && MIDmg <= EPS);
  const middleSlot     = isTID_dinAsMid ? "DIN" : "MID";   // used only in TID modes

  // ---- End-sequence (TID only; not applied during QID) ----
  if (!isQID) {
    if (has100) {
      if (Math.abs(tot - 300) < EPS) return makePacks({ AM:{100:1}, MID:{}, DIN:{}, PM:{100:1} });
      if (Math.abs(tot - 200) < EPS) return makePacks({ AM:{}, MID:{}, DIN:{}, PM:{100:1} });
      if (Math.abs(tot - 100) < EPS) return makePacks({ AM:{}, MID:{}, DIN:{}, PM:{} });
    } else {
      // If 100 not selected: first TID (using whichever middle slot is active) at the LSS → Review next
      if (isExactTIDAt(packs, lss, middleSlot)) { window._forceReviewNext = true; return packs; }
    }
  }

// ---- Compute this step's target from PREVIOUS ACHIEVED total, then quantise ----
const rawTarget = tot * (1 - percent/100);

// ✅ Always round UP to the next grid step (stepMg),
//    so we don't randomly round doses down (e.g., 1417 → 1400)
let targetRounded = ceilTo(rawTarget, stepMg);

// ✅ Anti-stall: if rounding up keeps us at (or above) the current total,
//    force at least one grid-step reduction
if (targetRounded >= tot - EPS && tot > 0) {
  targetRounded = Math.max(0, tot - stepMg);
}

// How much total reduction (in mg) we still need to achieve for this step
let reductionNeeded = Math.max(0, +(tot - targetRounded).toFixed(3));
if (reductionNeeded <= EPS) reductionNeeded = stepMg;   // safety: still ensure progress

  // ---- QID: rebuild DIN to the reduced target, leave AM/MID/PM untouched this step ----
  if (isQID) {
    const dec = Math.min(DINmg, roundTo(reductionNeeded, stepMg));
    const newDIN = Math.max(0, DINmg - dec);
    const targetDIN = floorTo(newDIN, stepMg);            // never increase
    const rebuilt = packSlotToMg(targetDIN, strengths, cap);
    if (rebuilt) {
      const out = clonePacks(packs);
      out.DIN = rebuilt;
      // if DIN hits 0, we pivot to TID at the next step automatically
      return out;
    }
    // If DIN couldn't be represented exactly (very rare), zero DIN and fall through
    if (targetDIN <= EPS) {
      const out = clonePacks(packs); out.DIN = {}; return out;
    }
  }

// ---- TID planning (covers normal TID and AM–DIN–PM variant) ----
// Prefer the UPWARD grid point first, only consider the lower one as a fallback
const candidateSums = (() => {
  const up   = ceilTo(targetRounded, stepMg);
  const down = floorTo(targetRounded, stepMg);
  return (down === up) ? [up] : [up, down];
})();

  let best = null;
  for (const S of candidateSums) {
    const cand = splitTID_ClosenessFirst(S, strengths, cap);
    if (!cand) continue;
    // Evaluate across S: nearest to raw target, then rounded up wins on tie
    const diff = Math.abs(S - rawTarget), roundedUp = (S >= rawTarget);
    const decorated = { ...cand, S, diff, roundedUp };
    if (!best || Sbetter(decorated, best)) best = decorated;
  }
  if (!best) return packs;

  // Map into the correct middle slot (MID in normal TID, DIN in AM–DIN–PM)
  const out = { AM: best.AM, MID:{}, DIN:{}, PM: best.PM };
  if (isTID_dinAsMid) out.DIN = best.MID; else out.MID = best.MID;
  return out;

  /* ===== helpers (scoped) ===== */

  function getSelectedStrengths(){
    // Prefer explicit mg list
    try {
      if (typeof selectedProductMgs === "function") {
        const picked = selectedProductMgs();
        if (Array.isArray(picked) && picked.length) {
          return picked.map(toMgLoose).filter(n=>n>0).sort((a,b)=>a-b);
        }
      }
    } catch(_){}
    // Fallbacks (older pickers / full catalogue for Gabapentin)
    let arr = [];
    try { if (typeof strengthsForSelected === 'function') arr = strengthsForSelected() || []; } catch(_){}
    try { if (!arr.length && typeof allowedStrengthsFilteredBySelection === 'function') arr = allowedStrengthsFilteredBySelection() || []; } catch(_){}
    if (!arr.length) {
      try { if (typeof strengthsForPicker === "function") arr = strengthsForPicker("Gabapentinoid", med, form) || []; } catch(_){}
    }
    return arr.map(toMgLoose).filter(n=>n>0).sort((a,b)=>a-b);
  }

  function toMgLoose(v){
    if (typeof v === "number") return v;
    if (typeof parseMgFromStrength === "function") {
      const x = parseMgFromStrength(v);
      if (Number.isFinite(x) && x > 0) return x;
    }
    const m = String(v).match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  }

  function nearestStep(x, step){
    if (!Number.isFinite(x) || !step) return 0;
    const r = x / step, flo = Math.floor(r), cei = Math.ceil(r);
    const dFlo = Math.abs(r - flo), dCei = Math.abs(cei - r);
    if (dFlo < dCei) return flo * step;
    if (dCei < dFlo) return cei * step;
    return cei * step; // exact tie -> round up
  }
  function roundTo(x, step){ return step ? Math.round(x/step)*step : x; }
  function floorTo(x, step){ return step ? Math.floor(x/step)*step : x; }

  function clonePacks(p){
    const out = { AM:{}, MID:{}, DIN:{}, PM:{} };
    for (const slot of Object.keys(out)){
      const src = p[slot] || {};
      for (const k of Object.keys(src)) out[slot][k] = src[k];
    }
    return out;
  }

  function isExactTIDAt(p, mg, middle="MID"){
    const AM = slotTotalMg(p,"AM"), MIDv = slotTotalMg(p,middle), PM = slotTotalMg(p,"PM");
    const other = (middle==="MID") ? "DIN" : "MID";
    const otherMg = slotTotalMg(p, other);
    return otherMg < EPS && Math.abs(AM-mg)<EPS && Math.abs(MIDv-mg)<EPS && Math.abs(PM-mg)<EPS;
  }

  // Pack a single slot to exactly 'amt' mg with selected strengths and unit cap; prefer largest-first then fill with smallest.
  function packSlotToMg(amt, strengths, capPerSlot){
    if (amt <= 0) return {};
    let r = amt;
    const out = {};
    // largest-first
    for (let i = strengths.length-1; i >= 0 && r > 0; i--){
      const mg = strengths[i];
      const q = Math.floor(r / mg);
      if (q > 0) {
        out[mg] = (out[mg] || 0) + q;
        r -= q * mg;
        if (countUnits(out) > capPerSlot) return null;
      }
    }
    // fill remainder (if any) with smallest step
    while (r > 0){
      const mg = strengths[0];
      out[mg] = (out[mg] || 0) + 1;
      r -= mg;
      if (countUnits(out) > capPerSlot) return null;
      if (r < 0) return null; // overshoot means unrepresentable exactly with given strengths/step
    }
    return out;
  }

  function countUnits(map){ return Object.values(map||{}).reduce((s,v)=>s+(v|0),0); }

  // Build a TID split for daily total S (multiple of step) that is as close as possible across slots
  function splitTID_ClosenessFirst(S, strengths, capPerSlot){
    if (S <= 0) return null;
    const step = strengths[0];
    const mean = S / 3;

    let best = null;

    // Enumerate a>=m, p>=a, a+m+p = S with step multiples
    for (let a = 0; a <= S; a += step){
      for (let m = 0; m <= a; m += step){
        const p = S - a - m;
        if (p < a) continue;                   // enforce p ≥ a ≥ m
        if (p < 0) break;
        // Try to pack each slot under cap
        const AMp = packSlotToMg(a, strengths, capPerSlot); if (AMp === null) continue;
        const MIDp= packSlotToMg(m, strengths, capPerSlot); if (MIDp=== null) continue;
        const PMp = packSlotToMg(p, strengths, capPerSlot); if (PMp === null) continue;

        const range = Math.max(a,m,p) - Math.min(a,m,p);
        const dev   = Math.abs(a-mean) + Math.abs(m-mean) + Math.abs(p-mean);
        const amEqPm = (a === p);
        const dayLoad= a + m;
        const units  = countUnits(AMp) + countUnits(MIDp) + countUnits(PMp);

        const cand = { AM:AMp, MID:MIDp, PM:PMp, a,m,p, range, dev, amEqPm, dayLoad, units };
        if (!best || splitBetter(cand, best)) best = cand;
      }
    }
    return best;
  }

  function splitBetter(a, b){
    // Primary closeness: range, then deviation from mean
    if (a.range !== b.range) return a.range < b.range;
    if (a.dev   !== b.dev)   return a.dev   < b.dev;
    // Then enforce our symmetry/day preferences
    if (a.amEqPm !== b.amEqPm) return a.amEqPm;       // prefer AM = PM
    if (a.dayLoad!== b.dayLoad) return a.dayLoad < b.dayLoad; // lighter daytime if tie so far
    // Then fewer units
    if (a.units !== b.units) return a.units < b.units;
    // Stable: smaller a (brings AM down if still tied), then smaller p
    if (a.a !== b.a) return a.a < b.a;
    if (a.p !== b.p) return a.p < b.p;
    return false;
  }

  function Sbetter(a, b){
    // Compare across candidate sums S (600 vs 700, etc.)
    if (a.diff !== b.diff) return a.diff < b.diff;
    if (a.roundedUp !== b.roundedUp) return a.roundedUp; // prefer rounding up on exact tie
    return a.S < b.S;
  }

  function makePacks(obj){
    const out = { AM:{}, MID:{}, DIN:{}, PM:{} };
    for (const slot of Object.keys(out)) {
      if (!obj[slot]) continue;
      for (const k of Object.keys(obj[slot])) {
        const v = obj[slot][k] | 0;
        if (v > 0) out[slot][k] = v;
      }
    }
    return out;
  }
}
/* ===== Benzodiazepine / Z-Drug (BZRA) — PM-only daily taper with selection & split rules ===== */
function stepBZRA(packs, percent, med, form){
  const cls = "Benzodiazepine / Z-Drug (BZRA)";
  const tot = packsTotalMg(packs);
  if (tot <= EPS) return packs;

  // Base step fallback: 6.25 for Zolpidem SR, else per map (default 0.5)
  const baseStep = (!isMR(form) || !/Zolpidem/i.test(med))
    ? ((BZRA_MIN_STEP && BZRA_MIN_STEP[med]) || 0.5)
    : 6.25;

  // Read currently selected strengths (numbers, ascending)
  let selectedMg = [];
  if (typeof selectedProductMgs === "function") {
    selectedMg = (selectedProductMgs() || [])
      .map(v => (typeof v === "number" ? v : (String(v).match(/(\d+(\.\d+)?)/)||[])[1]))
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a,b)=>a-b);
  }

  // If nothing explicitly selected, treat as "all products" for this BZRA
  let gridMg = selectedMg.slice();
  if ((!gridMg || !gridMg.length) && typeof strengthsForPicker === "function") {
    const all = strengthsForPicker(cls, med, form) || [];
    gridMg = all
      .map(v => (typeof v === "number" ? v : (String(v).match(/(\d+(\.\d+)?)/)||[])[1]))
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a,b)=>a-b);
  }

  // 0) Determine grid step from selection (LCS + quarter toggle) or fall back to baseStep
  const gridStep = (typeof selectionGridStepBZRA === "function")
    ? (selectionGridStepBZRA(med, form, gridMg) || 0)
    : 0;
  const step = gridStep || baseStep;

  // 1) Calculate raw target based on percentage reduction
  const raw = tot * (1 - percent/100);

  // 2) Round UP to the nearest allowed by the grid
  let target = ceilTo(raw, step);

  // Never increase the dose above the current total
  if (target > tot + EPS) {
    target = tot;
  }

  // 2b) If the rounded target is less than half a grid-step below the current dose,
  //     force at least one full step down. This avoids "fake" steps like 0.25 → 0.25.
  if ((tot - target) < (step / 2) && tot > 0) {
    target = roundTo(Math.max(0, tot - step), step);
  }

  // Safety: clamp very small negatives to zero
  if (target < 0 && Math.abs(target) < EPS) target = 0;
  if (target < 0) target = 0;

  // 3) Compose: try selection-aware first, then fallback to original composer
  let pm = null;
  const selectedForCompose = gridMg && gridMg.length ? gridMg : selectedMg;
  if (typeof composeForSlot_BZRA_Selected === "function" && selectedForCompose && selectedForCompose.length) {
    pm = composeForSlot_BZRA_Selected(target, cls, med, form, selectedForCompose);
  }
  if (!pm) {
    pm = composeForSlot(target, cls, med, form);
  }

  return { AM:{}, MID:{}, DIN:{}, PM: pm };

  // ----- local helpers (scoped) -----
  function buildUnitsBZRA(med, form, selected){
    const name = String(med||"").toLowerCase();
    const fr   = String(form||"").toLowerCase();
    const nonSplit = /slow\s*release|(?:^|\W)(sr|cr|er|mr)(?:\W|$)|odt|wafer|dispers/i.test(fr);

    let allowHalf  = false;
    let allowQuarter = false;

    if (!nonSplit && typeof canSplitTablets === "function") {
      const rule = canSplitTablets(cls, form, med) || {};
      allowHalf    = !!rule.half;
      allowQuarter = !!rule.quarter;
    }

    // If no explicit selection passed, use gridMg as the universe
    let mgList = Array.isArray(selected) && selected.length ? selected.slice() : gridMg.slice();

    const units = [];
    for (const mgRaw of (mgList || [])) {
      const mg = Number(mgRaw);
      if (!Number.isFinite(mg) || mg <= 0) continue;

      const mgClean = +mg.toFixed(3);   // base is fine at 3 d.p.

      // Always allow whole tablets
      units.push({ unit: mgClean, piece: 1.0 });

      if (!nonSplit && allowHalf) {
        const halfUnit = +(mgClean / 2).toFixed(4);
        units.push({ unit: halfUnit, piece: 0.5 });

        if (allowQuarter) {
          const quarterUnit = +(mgClean / 4).toFixed(4);
          units.push({ unit: quarterUnit, piece: 0.25 });
        }
      }
    }

    // Greedy composer will always try bigger units first → whole > halves > quarters
    units.sort((a,b)=> b.unit - a.unit);
    return units;
  }

  function piecesNeededBZRA(amount, med, form, selected){
    const units = buildUnitsBZRA(med, form, selected);
    if (!units.length) return null;
    let r = +amount.toFixed(6), pieces = 0;
    for (const u of units){
      if (r <= EPS) break;
      const q = Math.floor(r / u.unit + 1e-9);
      if (q > 0) { r -= q * u.unit; pieces += q * u.piece; }
    }
    return (r > EPS) ? null : pieces;
  }
}

function selectionGridStepBZRA(med, form, selectedMg){
  // Accept an explicit selection list, but if empty, treat as "all products" via strengthsForPicker
  let mgList = Array.isArray(selectedMg) ? selectedMg.slice() : [];

  const name = String(med||"").toLowerCase();
  const fr   = String(form||"").toLowerCase();

  // Detect modified/unsplittable forms
  const isMRform = (typeof isMR === "function")
    ? isMR(form)
    : /slow\s*release|(?:^|\W)(sr|cr|er|mr)(?:\W|$)/i.test(fr);
  const noSplitForm = isMRform || /odt|wafer|dispers/i.test(fr);

  // Special case: Zolpidem MR uses a fixed 6.25 mg grid
  if (isMRform && /zolpidem/i.test(name)) {
    return 6.25;
  }

  const cls = "Benzodiazepine / Z-Drug (BZRA)";

  if ((!mgList || !mgList.length) && typeof strengthsForPicker === "function") {
    const all = strengthsForPicker(cls, med, form) || [];
    mgList = all
      .map(v => (typeof v === "number" ? v : (String(v).match(/(\d+(\.\d+)?)/)||[])[1]))
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);
  }

  if (!mgList || !mgList.length) return 0;

  // Lowest commercial strength from the current (or implied) selection
  const lcs = mgList.slice().sort((a,b)=>a-b)[0];

  // If we cannot split this form, the grid is just the tablet strength
  if (noSplitForm) {
    return +lcs.toFixed(3);
  }

  const allowQuarter = (typeof isBzraQuarterAllowed === "function" && isBzraQuarterAllowed());

  // Grid = half or quarter of the LCS depending on the toggle
  const smallestPiece = allowQuarter ? (lcs / 4) : (lcs / 2);
  return +smallestPiece.toFixed(4);   // 4 d.p. so 0.0625 is preserved
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

  // --- local helpers for BID endpoint scheduling (selection-aware) ---
const toMg = (v) => {
  if (typeof v === 'number') return v;
  if (typeof parseMgFromStrength === 'function') {
    const x = parseMgFromStrength(v);
    if (Number.isFinite(x)) return x;
  }
  const m = String(v).match(/([\d.]+)\s*mg/i);
  return m ? parseFloat(m[1]) : NaN;
};

// Lowest *selected* mg (falls back to commercial lowest when none explicitly selected)
function selectedMinMg(cls, med, form){
  try{
    let arr = [];
    if (window.SelectedFormulations && SelectedFormulations.size > 0) {
      arr = Array.from(SelectedFormulations);
    } else if (typeof selectedProductMgs === "function") {
      arr = selectedProductMgs() || [];
    }
    let mg = arr.map(toMg).filter(x => Number.isFinite(x) && x > 0);
    if (mg.length) return Math.min.apply(null, mg);

    // fallback to full catalog/picker list when "none selected" (treat as all)
    const cat = (typeof strengthsForPicker === "function") ? (strengthsForPicker(cls, med, form) || []) : [];
    mg = cat.map(toMg).filter(x => Number.isFinite(x) && x > 0);
    return mg.length ? Math.min.apply(null, mg) : NaN;
  }catch(_){ return NaN; }
}

// Are we exactly at BID for the selected-min mg (AM and PM equal; MID/DIN zero)?
function isAtSelectedBID(packs, selMin){
  if (!Number.isFinite(selMin) || selMin <= 0) return false;
  const AM  = (typeof slotTotalMg === "function") ? slotTotalMg(packs,"AM")  : 0;
  const MID = (typeof slotTotalMg === "function") ? slotTotalMg(packs,"MID") : 0;
  const DIN = (typeof slotTotalMg === "function") ? slotTotalMg(packs,"DIN") : 0;
  const PM  = (typeof slotTotalMg === "function") ? slotTotalMg(packs,"PM")  : 0;
  return Math.abs(AM - selMin) < EPS && Math.abs(PM - selMin) < EPS && MID < EPS && DIN < EPS;
}

// Helper: read the user's AM/PM preference (default PM)
function heavierPref(){
  try {
    const am = document.getElementById("bidHeavyAM");
    const pm = document.getElementById("bidHeavyPM");
    if (am && am.checked) return "AM";
    return "PM";
  } catch { return "PM"; }
}

// Make a single-dose snapshot from current packs (keep AM or PM per preference; drop the rest)
function pmOnlyFrom(packs){
  // We keep the slot that matches the user's preference.
  // If someone wants "AM heavier", they likely want the last single dose in the morning.
  const keep = (heavierPref() === "AM") ? "AM" : "PM";
  const q = deepCopy(packs);

  // Clear all other slots
  if (keep !== "AM"  && q.AM)  q.AM.length  = 0;
  if (keep !== "MID" && q.MID) q.MID.length = 0;
  if (keep !== "DIN" && q.DIN) q.DIN.length = 0;
  if (keep !== "PM"  && q.PM)  q.PM.length  = 0;

  return q;
}

// For detection: treat "none selected" as "all selected"
function lowestSelectedForClassIsPresent(cls, med, form){
  if (typeof hasSelectedCommercialLowest === "function") {
    return hasSelectedCommercialLowest(cls, med, form);
  }
  // very defensive fallback if helper not present:
  return true;
}

// flag + payload for scheduling PM-only at next boundary, then Stop
if (typeof window !== "undefined") {
  if (window._pmOnlySnapshot === undefined) window._pmOnlySnapshot = null;
  if (window._forceStopNext === undefined)  window._forceStopNext  = false;
}
  
  // For Antipsychotic, seed from the four AP inputs; otherwise keep existing logic.
  
  let packs = (cls === "Antipsychotic" && typeof apSeedPacksFromFourInputs === "function")
  ? apSeedPacksFromFourInputs()
  : buildPacksFromDoseLines();
  if (packsTotalMg(packs) === 0) return [];
if (cls === "Antipsychotic") {
  if (typeof apIsOverCap === "function" && apIsOverCap()) {
    apMarkDirty?.(true, "The total daily dose exceeds the maximum for this antipsychotic. Reduce the dose to continue.");
    return []; // stop: no rows generated
  }
  apMarkDirty?.(false); // clean state before rendering
}
  const rows=[]; let date=new Date(startDate); const capDate = getChartCapDate(startDate);

const doStep = (phasePct) => {
  if (cls === "Opioid") packs = stepOpioid_Shave(packs, phasePct, cls, med, form);
  else if (cls === "Proton Pump Inhibitor") packs = stepPPI(packs, phasePct, cls, med, form);
  else if (cls === "Benzodiazepine / Z-Drug (BZRA)") packs = stepBZRA(packs, phasePct, med, form);
  else if (cls === "Gabapentinoid") packs = stepGabapentinoid(packs, phasePct, med, form);
  else packs = stepAP(packs, phasePct, med, form);
};

  // Step 1 on start date using whichever phase applies at start
  const useP2Now = p2Start && (+startDate >= +p2Start);
// STEP 1 — compute “calculated” from pre-step total, and “rounded” from the packs after stepping
const prevTotalMg_step1 = packsTotalMg(packs);
const usedPct_step1 = (useP2Now ? p2Pct : p1Pct);

doStep(usedPct_step1);
console.log("[DEBUG] Step1 packs:", JSON.stringify(packs));

if (packsTotalMg(packs) > EPS) {
  const roundedMg_step1   = packsTotalMg(packs);                             // policy-rounded, from engine
  const calculatedMg_step1= prevTotalMg_step1 * (1 - (usedPct_step1/100));   // informational
  const actualPct_step1   = prevTotalMg_step1 > EPS
    ? (100 * (1 - (roundedMg_step1 / prevTotalMg_step1)))
    : 0;

  rows.push({
    week: 1,
    date: fmtDate(date),
    packs: deepCopy(packs),
    med, form, cls,
    calculatedMg: calculatedMg_step1,
    roundedMg:    roundedMg_step1,
    actualPct:    actualPct_step1
  });
}

// If a BID class has reached selected-min BID and the class-lowest is among selections,
// schedule PM-only at next boundary, then Stop at the following boundary.
if (packsTotalMg(packs) > EPS && (cls === "Opioid" || cls === "Gabapentinoid")) {
  const selMin = selectedMinMg(cls, med, form);
  if (isAtSelectedBID(packs, selMin) && lowestSelectedForClassIsPresent(cls, med, form)) {
  window._pmOnlySnapshot = singleDoseFrom(packs);
}
}
  
  let week=1;
  while (packsTotalMg(packs) > EPS) {
    const nextByP1 = addDays(date, p1Int);
    const nextByP2 = addDays(date, p2Int);
    let nextDate;

// If a Stop was scheduled for this boundary (after PM-only), emit it now and finish
if (window._forceStopNext) {
  rows.push({ week: week+1, date: fmtDate(nextDate), packs:{}, med, form, cls, stop:true });
  window._forceStopNext = false;
  break;
}

// If a PM-only row was scheduled for this boundary, emit it now and prepare to Stop next
if (window._pmOnlySnapshot) {
  date = nextDate; week++;
  // Re-assert preference defensively in case some other code mutated the snapshot
  packs = singleDoseFrom(window._pmOnlySnapshot);
  window._pmOnlySnapshot = null;

  rows.push({ week, date: fmtDate(date), packs: deepCopy(packs), med, form, cls });
  window._forceStopNext = true;
  continue;
}
    
   // Phase rule: Phase 2 begins only AFTER the current Phase 1 step completes
if (p2Start && +date < +p2Start) {
  nextDate = nextByP1;
} else if (p2Start && +date >= +p2Start) {
  nextDate = nextByP2;
} else {
  nextDate = nextByP1;
}

    if (reviewDate && +nextDate >= +reviewDate) {rows.push({ week: week+1, date: fmtDate(reviewDate), packs:{}, med, form, cls, review:true });break;}
    if (+nextDate >= +capDate) {  rows.push({ date: fmtDate(capDate), packs:{}, med, form, cls, review:true }); break;}

// NEW: end-sequence Case B (LCS not selected) → force Review on the next boundary
if (window._forceReviewNext) {
  rows.push({ week: week+1, date: fmtDate(nextDate), packs:{}, med, form, cls, review:true });
  window._forceReviewNext = false;
  break;
}
    // Stash the pre-step total for THIS iteration’s row
const _prevTotalMg_beforeStep = packsTotalMg(packs);
    date = nextDate; week++;
    const nowInP2 = p2Start && (+date >= +p2Start);
    const _usedPct_forStep = (nowInP2 ? p2Pct : p1Pct);
    doStep(nowInP2 ? p2Pct : p1Pct);

    // Suppress duplicate row if a step forced review and did not change packs
if (typeof window !== "undefined" && window._forceReviewNext){
  // If step returned the same dose, show review now at this boundary and stop
  // (prevents printing the same BID dose twice)
  window._forceReviewNext = false;
  rows.push({ week: week, date: fmtDate(date), packs:{}, med, form, cls, review:true });
  break;
}
    
    if (packsTotalMg(packs) > EPS) {
  // For the row we just produced, show the policy-rounded total and the actual % change
  // We need the "pre-step" total and the pct we used for THIS step:
  // 1) pre-step total was what we had before calling doStep this iteration
  // 2) pct used was decided by nowInP2 (see below where we compute it)

  // We stashed these just before calling doStep in this iteration:
  const roundedMg_iter   = packsTotalMg(packs);                                   // policy-rounded after step
  const calculatedMg_iter= _prevTotalMg_beforeStep * (1 - (_usedPct_forStep/100)); // informational
  const actualPct_iter   = _prevTotalMg_beforeStep > EPS
    ? (100 * (1 - (roundedMg_iter / _prevTotalMg_beforeStep)))
    : 0;

  rows.push({
    week,
    date: fmtDate(date),
    packs: deepCopy(packs),
    med, form, cls,
    calculatedMg: calculatedMg_iter,
    roundedMg:    roundedMg_iter,
    actualPct:    actualPct_iter
  });
}
    if (week > MAX_WEEKS) break;
  }

  // Re-check: if we just landed at selected-min BID with lowest selected, schedule PM-only next
if (packsTotalMg(packs) > EPS && (cls === "Opioid" || cls === "Gabapentinoid")) {
  const selMin = selectedMinMg(cls, med, form);
  if (isAtSelectedBID(packs, selMin) && lowestSelectedForClassIsPresent(cls, med, form)) {
  window._pmOnlySnapshot = singleDoseFrom(packs);
}
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
  const wrap = card.closest(".sub-card") || card;
  wrap.style.display = "";
  card.style.display = "";
  
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

const isPatch = /Patch/i.test(form);

// treat as “empty” unless at least one strength parses to a usable number
const bases = (strengths || [])
  .map(s => {
    if (isPatch) return (typeof parsePatchRate === "function") ? parsePatchRate(s) : 0;
    return (typeof parseMgFromStrength === "function") ? parseMgFromStrength(s) : 0;
  })
  .filter(v => Number.isFinite(v) && v > 0);

const hasRenderable = bases.length > 0;

if (!canShow || !hasRenderable){
  wrap.style.display = "none";
  card.style.display = "none";
  host.innerHTML = "";
  return;
}
  wrap.style.display = "";
  card.style.display = "";
  host.innerHTML = "";

  // build the checkbox list
  strengths.forEach(s => {
const base = isPatch
  ? ((typeof parsePatchRate === "function") ? parsePatchRate(s) : (parseFloat(String(s).replace(/[^\d.]/g,"")) || 0))
  : ((typeof parseMgFromStrength === "function") ? parseMgFromStrength(s) : (parseFloat(String(s).replace(/[^\d.]/g,"")) || 0));

if (!Number.isFinite(base) || base <= 0) return;


    const id = `prod_${String(med).replace(/\W+/g,'_')}_${base}`;

    const label = document.createElement("label");
    label.className = "checkbox";
    label.setAttribute("for", id);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.dataset.base = String(base);

    // if user has any selection, reflect it; otherwise leave unchecked (meaning "use all")
    cb.checked = (SelectedFormulations.size > 0) ? SelectedFormulations.has(Number(base)) : false;

cb.addEventListener("change", () => {
  const n = Number(base);
  if (cb.checked) SelectedFormulations.add(n);
  else SelectedFormulations.delete(n);

  if (typeof setDirty === "function") setDirty(true);
  if (typeof setGenerateEnabled === "function") setGenerateEnabled();
});
    const span = document.createElement("span");
  const title = (typeof strengthToProductLabel === "function")
  ? strengthToProductLabel(cls, med, form, s)
  : (isPatch ? `${base} mcg/hr` : `${base} mg`);
    span.textContent = title;

    label.appendChild(cb);
    label.appendChild(span);
    host.appendChild(label);
  });
    // If nothing rendered, hide the whole card (prevents empty card UI)
  if (!host.children || host.children.length === 0) {
    wrap.style.display = "none";
    card.style.display = "none";
    host.innerHTML = "";
    return;
  }

  // wire buttons (rebind on every render so they're always current)
  const btnSelectAll = document.getElementById("selectAllProductSelection");
  const btnClear     = document.getElementById("clearProductSelection");

  if (btnSelectAll){
    btnSelectAll.onclick = () => {
      SelectedFormulations.clear();
      // tick everything currently shown
      host.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
        const base = parseFloat(cb.dataset.base);
           if (Number.isFinite(base) && base > 0) SelectedFormulations.add(Number(base));
      });
      if (typeof setDirty === "function") setDirty(true);
      if (typeof setGenerateEnabled === "function") setGenerateEnabled();
    };
  }

  if (btnClear){
    btnClear.onclick = () => {
      SelectedFormulations.clear();
      host.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      if (typeof setDirty === "function") setDirty(true);
      if (typeof setGenerateEnabled === "function") setGenerateEnabled();
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
     setTimeout(() => {
    renderProductPicker();
    }, 0);
    if (typeof setDirty === "function") setDirty(true);
    if (typeof setGenerateEnabled === "function") setGenerateEnabled();
  };
  if (med  && !med._ppReset)  { med._ppReset  = true; med.addEventListener("change", reset); }
  if (form && !form._ppReset) { form._ppReset = true; form.addEventListener("change", reset); }
})();


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

  const capDate = getChartCapDate(startDate);
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
  const baseAsc  = allowedStrengthsFilteredBySelection().slice().sort((a,b)=>a-b);
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

bases.forEach(b => {
  const q = byBase[b];
  if (!q) return;

  const lines = [];

  // --- 1. Choose the wording unit ("tablet" vs "capsule") ---
  let doseUnit = "tablet";

  if (r.cls === "Gabapentinoid" && r.med === "Gabapentin") {
    // Use the same strength→form mapping we used for the instructions:
    const formForStrength =
      (typeof GABA_FORM_BY_STRENGTH !== "undefined" && GABA_FORM_BY_STRENGTH)
        ? (GABA_FORM_BY_STRENGTH[b] || "Capsule")
        : "Capsule";

    doseUnit = /Capsule/i.test(formForStrength) ? "capsule" : "tablet";
  }

  if (q.AM)  lines.push(`Take ${unitsPhraseDigits(q.AM, doseUnit)} in the morning`);
  if (q.MID) lines.push(`Take ${unitsPhraseDigits(q.MID, doseUnit)} at midday`);
  if (q.DIN) lines.push(`Take ${unitsPhraseDigits(q.DIN, doseUnit)} in the evening`);
  if (q.PM)  lines.push(`Take ${unitsPhraseDigits(q.PM, doseUnit)} at night`);

  if (!lines.length) return;

  // --- 2. Build the Strength label ---
  let strengthLabel;

  if (/Oxycodone\s*\/\s*Naloxone/i.test(r.med)) {
    // Special paired label for oxycodone/naloxone
    strengthLabel = oxyNxPairLabel(b);
  } else if (r.cls === "Gabapentinoid" && r.med === "Gabapentin") {
    // Gabapentin: use the same Capsule/Tablet mapping per strength
    const formForStrength =
      (typeof GABA_FORM_BY_STRENGTH !== "undefined" && GABA_FORM_BY_STRENGTH)
        ? (GABA_FORM_BY_STRENGTH[b] || "Capsule")
        : "Capsule";

    strengthLabel = `${r.med} ${stripZeros(b)} mg ${formForStrength}`;
  } else {
    // Everyone else: use the generic suffix (Tablet, SR Tablet, Capsule, etc.)
    strengthLabel = `${medName} ${stripZeros(b)} mg ${suffix}`;
  }

  strengthLabel = prettySelectedLabelOrSame(r.cls, r.med, r.form, strengthLabel);

  rows.push({
    strengthLabel,
    instructions: lines.join("\n"),
    am: mkCell(q.AM),
    mid: mkCell(q.MID),
    din: mkCell(q.DIN),
    pm: mkCell(q.PM)
  });
});

  return rows;
}
function patchTotalFromRow(row){
  // 1) Direct numeric totals (if present)
  if (Number.isFinite(row?.totalRate)) return row.totalRate;
  if (Number.isFinite(row?.total)) return row.total;
  // 2) Preferred: patch rows store an array like [5, 30, 5]
  if (Array.isArray(row?.patches)) {
    return row.patches.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }
  // 3) Fallback: object like { "25 mcg/hr": 1, "12.5 mcg/hr": 1 }
  if (row && row.packs && typeof row.packs === "object") {
    let total = 0;
    for (const k of Object.keys(row.packs)) {
      const qty = parseFloat(row.packs[k]) || 0;
      total += parsePatchRate(k) * qty;
    }
    return total;
  }
  return 0;
}
/* =============================================================
SHOW CALCULATIONS — logger + renderer (no recalculation)
Hooks into renderStandardTable/renderPatchTable
============================================================= */
(function () {
  const EPS = 1e-6;

  const calcLogger = {
    rows: [],
    clear(){ this.rows = []; },

    updateVarianceNotice(){
      const host = document.getElementById("varianceNotice");
      if (!host) return;
      const hasVariance = this.rows.some(r => (r.actualPct - r.cfgPct) > EPS);
      host.style.display = hasVariance ? "" : "none";
    },

    buildFromRows(stepRows){
      this.clear();

      const cls  = document.getElementById("classSelect")?.value || "";
      const form = document.getElementById("formSelect")?.value || "";
      const isPatch = /Patch/i.test(form);

      const p1Pct = num(document.getElementById("p1Percent")?.value);
      const p2Pct = num(document.getElementById("p2Percent")?.value);
      const p2Int = Math.max(0, parseInt(document.getElementById("p2Interval")?.value || "", 10));
      const p2StartInput = document.getElementById("p2StartDate");
      const p2Start = (p2Pct > 0 && p2Int > 0 && p2StartInput)
        ? (p2StartInput._flatpickr?.selectedDates?.[0] || (p2StartInput.value ? new Date(p2StartInput.value) : null))
        : null;

      const unit = isPatch ? "mcg/h" : "mg";

      // --- Baseline total from current inputs ---
      let prevTotal = 0;

      if (cls === "Antipsychotic" && typeof window.apSeedPacksFromFourInputs === "function") {
        prevTotal = safePacksTotalMg(window.apSeedPacksFromFourInputs() || {});
      } else if (isPatch) {
        prevTotal = sumPatchesFromDoseLines();

        // PATCH SAFETY NET: if doseLines didn’t yield a total, try first plan row
        if (prevTotal <= EPS) {
          const firstDoseRow = (stepRows || []).find(r => !(r.stop || r.review));
          const fromRow = patchTotalFromRow(firstDoseRow);
          if (fromRow > EPS) prevTotal = fromRow;
        }
      } else if (typeof window.buildPacksFromDoseLines === "function") {
        prevTotal = safePacksTotalMg(window.buildPacksFromDoseLines() || {});
      }

      let keptAny = false;

      (stepRows || []).forEach((row) => {
        if (row.stop || row.review) return;

        const dateStr = row.dateStr || row.date || row.when || "";

        // Read the chosen dose from the plan row itself
        let chosen = 0;
        if (isPatch) {
          chosen = patchTotalFromRow(row);
          if (chosen <= EPS) chosen = prevTotal; // fallback only if row couldn't be read
        } else {
          chosen = safePacksTotalMg(row.packs);
        }

        // PATCH ONLY: collapse rows where the dose didn't change (optional)
        if (isPatch && keptAny && prevTotal > EPS && Math.abs(chosen - prevTotal) < EPS) return;

        const cfgPct = pickConfiguredPercentForDate(dateStr, p1Pct, p2Pct, p2Start);

      // Step 1 = first reduction target from baseline
      let rawTarget = prevTotal * (1 - (cfgPct / 100));
      let actualPct = prevTotal > EPS ? (100 * (1 - (chosen / prevTotal))) : 0;

        this.rows.push({
          step: this.rows.length + 1,
          date: dateStr,
          target: rawTarget,
          cfgPct,
          chosen,
          unit,
          actualPct
        });

        keptAny = true;
        prevTotal = chosen;
      });

      this.updateVarianceNotice();
    },

    render(){
      const hostCard  = document.getElementById("calcBlock");
      const hostTable = document.getElementById("calcTableHost");
      const checked   = document.getElementById("showCalc")?.checked;
      if (!hostCard || !hostTable) return;

      if (!checked || !this.rows.length) {
        hostCard.style.display = "none";
        hostTable.innerHTML = "";
        return;
      }

      const tbl = document.createElement("table");
      tbl.className = "plan-table calc-table";

      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Step","Date","Calculated Dose","Selected % Change","Rounded Dose","Actual % Change"]
        .forEach(h => { const th = document.createElement("th"); th.textContent = h; trh.appendChild(th); });
      thead.appendChild(trh);
      tbl.appendChild(thead);

      const tbody = document.createElement("tbody");
      this.rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.appendChild(td(r.step));
        tr.appendChild(td(r.date || ""));
        tr.appendChild(td(fmtQty(r.target, r.unit), "mono"));
        tr.appendChild(td(stripZeros(+r.cfgPct) + "%"));
        tr.appendChild(td(fmtQty(r.chosen, r.unit), "mono"));
        tr.appendChild(td(stripZeros(+r.actualPct.toFixed(1)) + "%"));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);

      hostTable.innerHTML = "";
      hostTable.appendChild(tbl);
      hostCard.style.display = "";
    }
  };

  // ---------- helpers ----------
  function num(v){ const n = parseFloat(v ?? ""); return isFinite(n) ? n : 0; }

  function stripZeros(n){
    if (typeof window.stripZeros === "function") return window.stripZeros(n);
    if (Number.isInteger(n)) return String(n);
    return String(n).replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0+$/,"");
  }

  function fmtQty(n, unit){
    const val = Math.abs(n) < EPS ? 0 : +(+n).toFixed(2);
    return `${stripZeros(val)} ${unit}`;
  }

  function safePacksTotalMg(p){
    try{
      if (typeof window.packsTotalMg === "function") return window.packsTotalMg(p || {});
      const s = k => Object.entries((p||{})[k]||{}).reduce((a,[mg,c]) => a + (+mg)*(+c||0), 0);
      return s("AM")+s("MID")+s("DIN")+s("PM");
    } catch { return 0; }
  }

function sumPatchesFromDoseLines(){
  const form = document.getElementById("formSelect")?.value || "";
  if (!/Patch/i.test(form)) return 0;

  // IMPORTANT: support BOTH "doseLines" (your patch builder uses this)
  // and "window.doseLines" (older versions used this)
  const lines =
    (typeof window !== "undefined" && Array.isArray(window.doseLines) && window.doseLines) ? window.doseLines :
    (typeof doseLines !== "undefined" && Array.isArray(doseLines) && doseLines) ? doseLines :
    [];

  return lines.reduce((sum, ln) => {
    const strength =
      ln?.strengthStr ??
      ln?.strengthLabel ??
      ln?.strength ??
      "";

    const rawQty =
      ln?.qty ??
      ln?.quantity ??
      ln?.count ??
      0;

    const rate = parsePatchRate(strength);
    const qty  = Math.max(0, Math.floor(parseFloat(rawQty) || 0));

    return sum + (Number.isFinite(rate) ? rate : 0) * qty;
  }, 0);
}

function sumPatches(list){
  try {
    return (list || []).reduce((s, p) => {
      if (typeof p === "number") return s + p;        // numeric patch rates
      return s + ((+p?.rate) || 0);                   // {rate: ...}
    }, 0);
  } catch {
    return 0;
  }
}
function patchTotalFromRow(row){
  if (Number.isFinite(row?.totalRate)) return row.totalRate;
  if (Number.isFinite(row?.total)) return row.total;

  // patch rows store an array like [5, 30, 5]
  if (Array.isArray(row?.patches)) {
    return row.patches.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }

  // fallback: object like { "25 mcg/hr": 1, "12.5 mcg/hr": 1 }
  if (row && row.packs && typeof row.packs === "object") {
    let total = 0;
    for (const k of Object.keys(row.packs)) {
      const qty = parseFloat(row.packs[k]) || 0;
      total += parsePatchRate(k) * qty;
    }
    return total;
  }

  return 0;
}
 
  function pickConfiguredPercentForDate(dateStr, p1Pct, p2Pct, p2Start){
    if (!(p2Start instanceof Date) || !(p2Pct > 0)) return p1Pct;
    try { const dt = new Date(dateStr); if (isFinite(+dt) && +dt >= +p2Start) return p2Pct; } catch {}
    return p1Pct;
  }

  function td(text, cls){ const el = document.createElement("td"); if (cls) el.className = cls; el.textContent = text; return el; }

  // ---------- wrap existing renderers ----------
  const _renderStd   = (typeof window.renderStandardTable === "function") ? window.renderStandardTable : null;
  if (_renderStd){
    window.renderStandardTable = function(rows){
      try { calcLogger.buildFromRows(rows); } catch {}
      const rv = _renderStd.apply(this, arguments);
      try { if (document.getElementById("showCalc")?.checked) calcLogger.render(); } catch {}
      return rv;
    };
  }

  const _renderPatch = (typeof window.renderPatchTable === "function") ? window.renderPatchTable : null;
  if (_renderPatch){
    window.renderPatchTable = function(rows){
      try { calcLogger.buildFromRows(rows); } catch {}
      const rv = _renderPatch.apply(this, arguments);
      try { if (document.getElementById("showCalc")?.checked) calcLogger.render(); } catch {}
      return rv;
    };
  }

  // ---------- checkbox toggle ----------
  function wireCalcToggle(){
    const el = document.getElementById("showCalc");
    if (!el) return;
    el.addEventListener("change", () => {
      const hostCard = document.getElementById("calcBlock");
      if (el.checked) { try { calcLogger.render(); } catch {} }
      else if (hostCard) { hostCard.style.display = "none"; }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireCalcToggle);
  else                                   wireCalcToggle();
})();

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
    // 1b) Chart horizon controls ("Generate chart for")
  const durationRadio = document.getElementById("taperModeDuration");
  const endRadio = document.getElementById("taperModeDate");
  const durationSelect = document.getElementById("taperDuration");
  const endInput = document.getElementById("taperEndDate");

  const syncTaperModeUI = () => {
    if (durationRadio && durationSelect) durationSelect.disabled = !durationRadio.checked;
    if (endRadio && endInput) endInput.disabled = !endRadio.checked;
  };

  // Default to "Until complete"
  if (durationRadio) durationRadio.checked = true;
  if (durationSelect) durationSelect.value = "complete";
  syncTaperModeUI();

  // If user interacts with controls, switch modes automatically
  durationSelect?.addEventListener("change", () => {
    if (durationRadio) durationRadio.checked = true;
    syncTaperModeUI();
    setDirty(true);
    setGenerateEnabled();
  });

  endInput?.addEventListener("change", () => {
    if (endRadio) endRadio.checked = true;
    syncTaperModeUI();
    setDirty(true);
    setGenerateEnabled();
  });

  durationRadio?.addEventListener("change", () => {
    syncTaperModeUI();
    setDirty(true);
    setGenerateEnabled();
  });

  endRadio?.addEventListener("change", () => {
    syncTaperModeUI();
    setDirty(true);
    setGenerateEnabled();
  });

  // Keep end-date >= start-date (best-effort, only if flatpickr is present)
  const startEl = document.getElementById("startDate");
  const bumpEndMinDate = () => {
    if (!endInput || !endInput._flatpickr) return;

    let sd = null;
    if (startEl && startEl._flatpickr &&
        Array.isArray(startEl._flatpickr.selectedDates) &&
        startEl._flatpickr.selectedDates[0]) {
      sd = startEl._flatpickr.selectedDates[0];
    } else if (startEl && startEl.value) {
      const parts = startEl.value.split("/").map(s => parseInt(s, 10));
      if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
        const [dd, mm, yyyy] = parts;
        sd = new Date(yyyy, mm - 1, dd);
      }
    }

    if (sd instanceof Date && !isNaN(+sd)) {
      endInput._flatpickr.set("minDate", sd);
    }
  };

  startEl?.addEventListener("change", bumpEndMinDate);
  bumpEndMinDate();

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
      if (window.SelectedFormulations && typeof SelectedFormulations.clear === "function") {
    SelectedFormulations.clear();}
    populateMedicines();
    populateForms();
    updateRecommended();
    applyPatchIntervalAttributes();
    renderProductPicker();
    bzraVisibilityTick();
    bidPrefVisibilityTick();
    printAdminVisibilityTick();
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
    bidPrefVisibilityTick();
    printAdminVisibilityTick();
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
  document.getElementById("printAdminBtn")?.addEventListener("click", printWithAdministrationRecord);
  document.getElementById("savePdfBtn")?.addEventListener("click", saveOutputAsPdf);
document.getElementById("classSelect")?.addEventListener("change", () => {
  updateBestPracticeBox();
  updateClassFooter();
});

updateBestPracticeBox();
updateClassFooter();
  renderProductPicker();

  
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
    <p>
      This calculator and its associated content are intended exclusively for use by qualified health professionals and developed for the Australian context. 
      It is designed to support deprescribing, when this is deemed clinically appropriate by the prescriber. 
      This calculator does not replace professional clinical judgment. The interpretation and application of any information obtained from this calculator remain the sole responsibility of the user.
    </p>

    <p>
      This calculator is <strong>not</strong> designed for generating an individualised tapering plan for complex patients (eg those with severe substance use disorder); these patients require tailored plans beyond the scope of this calculator.
    </p>

    <p>
      <strong>By accessing and using this site, you acknowledge and agree to the following:</strong><br>
      • You will exercise your own independent clinical judgement when treating patients.<br>
      • You accept and agree to these terms and conditions.
    </p>

    <label class="inline-label" for="acceptTaperDisclaimer" style="margin-top:10px; display:block;">
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

//#endregion
