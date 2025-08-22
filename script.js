/* =========================================================
   Deprescribing Taper Planner — Pre-JSON, V8 + fentanyl fix
   ========================================================= */

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const EPS = 1e-9;
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtDate = (d) => {
  try {
    const dd = d instanceof Date ? d : new Date(d);
    const day = String(dd.getDate()).padStart(2, "0");
    const mon = String(dd.getMonth() + 1).padStart(2, "0");
    const yr = dd.getFullYear();
    return `${day} ${dd.toLocaleString("en-GB", { month: "short" })} ${yr}`;
  } catch {
    return "";
  }
};
const showToast = (msg) => {
  alert(msg);
};

/* ---------- global state for dose lines ---------- */
let nextLineId = 1;
let doseLines = [];
let dirty = false;

/* ---------- domain helpers you already use ---------- */
/* NOTE: These are placeholders for your existing catalogs/helpers.
   Keep your current implementations for:
   - populateClasses / populateMedicines / populateForms
   - strengthsForSelected / parseMgFromStrength / parsePatchRate
   - canSplitTablets / allowedPiecesMg / formLabelCapsSR / isMR
   - specialInstructionFor / setFooterText
   - packs builders & step functions (opioidOrPpiStep, bzraStep, apStep, etc.)
   If you already have them in your file, leave them as-is.
*/

/* =======================
   PATCH-SPECIFIC FIXES
   ======================= */

/** Collapse pairs of 12 or 12.5 to 25; keep at most two patches total. */
function collapseFentanylTwelves(patches) {
  // Accept numbers like 12, 12.5, 25, 37.5, 50, etc.
  const isTwelve = (v) =>
    Math.abs(v - 12) < 0.01 || Math.abs(v - 12.5) < 0.01;

  let twelves = 0;
  const others = [];
  for (const v of patches) {
    if (isTwelve(v)) twelves++;
    else others.push(v);
  }

  // Every pair of twelves -> one 25
  const pairs = Math.floor(twelves / 2);
  for (let i = 0; i < pairs; i++) others.push(25);

  // If an odd one remains, keep a single 12
  if (twelves % 2 === 1) others.push(12);

  // Sort high → low and cap length to 2 (safety cap you asked for)
  return others.sort((a, b) => b - a).slice(0, 2);
}

/* =======================
   RENDERING
   ======================= */

function td(txt) {
  const el = document.createElement("td");
  el.textContent = txt;
  return el;
}
function trStopRow(label) {
  const tr = document.createElement("tr");
  // Date beginning
  tr.appendChild(td(label || ""));
  // Merge remaining columns into one “Instructions” cell
  const merge = document.createElement("td");
  merge.colSpan = 3; // for patch table (Strength + Instructions)
  merge.textContent = "Stop.";
  tr.appendChild(merge);
  return tr;
}
function trReviewRow(label) {
  const tr = document.createElement("tr");
  tr.appendChild(td(label || ""));
  const merge = document.createElement("td");
  merge.colSpan = 3;
  merge.textContent = "Review with your doctor the ongoing plan";
  tr.appendChild(merge);
  return tr;
}

/** Renders the standard (non-patch) schedule table from your computed rows. */
function renderStandardTable(rows) {
  const schedule = $("scheduleBlock"),
    patch = $("patchBlock");
  patch.style.display = "none";
  schedule.style.display = "";
  schedule.innerHTML = "";

  const table = document.createElement("table");
  table.className = "table";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  [
    "Date beginning",
    "Strength",
    "Instructions",
    "Morning",
    "Midday",
    "Dinner",
    "Night",
  ].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    // Stop/Review rows
    if (r.stop) {
      const tr = document.createElement("tr");
      tr.appendChild(td(r.date || ""));
      const merge = document.createElement("td");
      merge.colSpan = 6;
      merge.textContent = "Stop.";
      tr.appendChild(merge);
      tbody.appendChild(tr);
      return;
    }
    if (r.review) {
      const tr = document.createElement("tr");
      tr.appendChild(td(r.date || ""));
      const merge = document.createElement("td");
      merge.colSpan = 6;
      merge.textContent = "Review with your doctor the ongoing plan";
      tr.appendChild(merge);
      tbody.appendChild(tr);
      return;
    }

    const tr = document.createElement("tr");
    tr.appendChild(td(r.date || ""));
    tr.appendChild(td(r.strengthLabel || ""));
    tr.appendChild(td(r.instructions || ""));
    tr.appendChild(td(r.am || ""));
    tr.appendChild(td(r.mid || ""));
    tr.appendChild(td(r.din || ""));
    tr.appendChild(td(r.pm || ""));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  schedule.appendChild(table);
}

/** Renders the PATCH schedule table; includes fentanyl 12+12→25 collapse. */
function renderPatchTable(rows) {
  const schedule = $("scheduleBlock"),
    patch = $("patchBlock");
  schedule.style.display = "none";
  patch.style.display = "";
  patch.innerHTML = "";

  const table = document.createElement("table");
  table.className = "table";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Apply on", "Remove on", "Patch strength(s)", "Instructions"].forEach(
    (h) => {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    }
  );
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach((r) => {
    // Stop / Review rows
    if (r.stop) {
      const tr = document.createElement("tr");
      tr.appendChild(td(r.date || ""));
      const merge = document.createElement("td");
      merge.colSpan = 3;
      merge.textContent = "Stop.";
      tr.appendChild(merge);
      tbody.appendChild(tr);
      return;
    }
    if (r.review) {
      const tr = document.createElement("tr");
      tr.appendChild(td(r.date || ""));
      const merge = document.createElement("td");
      merge.colSpan = 3;
      merge.textContent = "Review with your doctor the ongoing plan";
      tr.appendChild(merge);
      tbody.appendChild(tr);
      return;
    }

    const tr = document.createElement("tr");
    tr.appendChild(td(r.date || ""));
    tr.appendChild(td(r.remove || ""));

    // --- collapse 12 + 12 → 25 for Fentanyl only (display time) ---
    let list = Array.isArray(r.patches) ? r.patches.slice() : [];
    const medName = r.med || "";
    if (/Fentanyl/i.test(medName)) {
      list = collapseFentanylTwelves(
        list.map((v) => (typeof v === "number" ? v : parseFloat(v) || 0))
      );
    }

    const label =
      list.length > 0
        ? list.map((v) => `${Math.round(v) === 12 ? 12 : Math.round(v)} mcg/hr`).join(" + ")
        : "";

    tr.appendChild(td(label));

    // Instruction (keep your existing phrasing rule)
    tr.appendChild(
      td(r.instructions || (list.length > 1 ? "Apply patches every 3 days." : "Apply patch every 3 days."))
    );

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  patch.appendChild(table);
}

/* =======================
   BUILDERS (tablets / patches)
   ======================= */

/* Your existing tablet builders go here.
   Ensure these functions exist (unchanged from your current file):
   - buildPacksFromDoseLines()
   - opioidOrPpiStep(), bzraStep(), apStep()
   - buildPlanTablets() -> returns rows for renderStandardTable()
*/

/* ------- Patch builder (uses your current logic; unchanged) ------- */
function buildPlanPatch() {
  const med = $("medicineSelect").value;
  const startDate = $("startDate")
    ? $("startDate")._flatpickr?.selectedDates?.[0] || new Date()
    : new Date();
  const reviewDate = $("reviewDate")
    ? $("reviewDate")._flatpickr?.selectedDates?.[0] || null
    : null;

  const applyEvery = med === "Fentanyl" ? 3 : 7;

  const p1Pct = Math.max(0, parseFloat($("p1Percent")?.value || ""));
  const p1Int = Math.max(0, parseInt($("p1Interval")?.value || "", 10));
  const p2Pct = Math.max(0, parseFloat($("p2Percent")?.value || ""));
  const p2Int = Math.max(0, parseInt($("p2Interval")?.value || "", 10));
  const p2DateVal =
    $("p2StartDate")?._flatpickr?.selectedDates?.[0] ||
    ($("p2StartDate")?.value ? new Date($("p2StartDate")?.value) : null);
  const p2Start =
    p2Pct > 0 && p2Int > 0 && p2DateVal && !isNaN(+p2DateVal) ? p2DateVal : null;

  if (!(p1Pct > 0 && p1Int > 0)) {
    showToast("Enter a percentage and an interval to generate a plan.");
    return [];
  }

  const strengths = strengthsForSelected()
    .map(parsePatchRate)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const smallest = strengths[strengths.length - 1];

  // Start total = Σ (strength × quantity)
  let startTotal = 0;
  doseLines.forEach((ln) => {
    const mg = parsePatchRate(ln.strengthStr) || 0;
    const qty = Math.max(0, Math.floor(ln.qty ?? 0));
    startTotal += mg * qty;
  });
  if (startTotal <= 0) {
    showToast("Add at least one patch (quantity > 0) before generating.");
    return [];
  }

  const rows = [];
  let curApply = new Date(startDate);
  let curRemove = addDays(curApply, applyEvery);

  let prevTotal = startTotal;
  let currentCombo = [prevTotal];

  let currentPct = p1Pct,
    currentReduceEvery = p1Int;
  let nextReductionCutoff = new Date(startDate); // first reduction on start date

  const capDate = new Date(+startDate + THREE_MONTHS_MS);
  let smallestAppliedOn = null;
  let stopThresholdDate = null;

  const pushRow = () =>
    rows.push({
      date: fmtDate(curApply),
      remove: fmtDate(curRemove),
      patches: currentCombo.slice(),
      med,
      form: "Patch",
    });
  const pushFinal = (type, whenDate) =>
    rows.push({
      date: fmtDate(whenDate),
      patches: [],
      med,
      form: "Patch",
      stop: type === "stop",
      review: type === "review",
    });

  let p2Armed = !!p2Start;

  while (true) {
    // Phase-2: switch parameters on the first Apply-on ≥ p2Start
    if (p2Armed && +curApply >= +p2Start) {
      currentPct = p2Pct;
      currentReduceEvery = p2Int;
      nextReductionCutoff = new Date(curApply); // allow immediate P2 reduction at this apply
      p2Armed = false;
    }

    // Apply reduction when we reach the reduction date
    if (+curApply >= +nextReductionCutoff) {
      const rawTarget = prevTotal * (1 - currentPct / 100);
      const pick = choosePatchTotal(prevTotal, rawTarget, med); // your existing chooser
      prevTotal = pick.total;
      currentCombo = pick.combo.slice();

      // record first time smallest applied
      if (
        smallestAppliedOn == null &&
        Math.abs(prevTotal - smallest) < 1e-6
      ) {
        smallestAppliedOn = new Date(curApply);
        stopThresholdDate = addDays(
          new Date(smallestAppliedOn),
          applyEvery
        ); // stop 1 interval after first smallest
      }

      nextReductionCutoff = addDays(curApply, currentReduceEvery);
    }

    // Push the row
    pushRow();

    // Check hard caps
    const hitReview = reviewDate && +curApply >= +reviewDate;
    const hit3mo = +curApply >= +capDate;
    if (hitReview) {
      pushFinal("review", new Date(curApply));
      break;
    }
    if (stopThresholdDate && +curRemove >= +stopThresholdDate) {
      // stop on the removal after reaching the lowest
      pushFinal("stop", new Date(curRemove));
      break;
    }
    if (hit3mo) {
      pushFinal("review", new Date(curApply));
      break;
    }

    // Next patch cycle
    curApply = addDays(curApply, applyEvery);
    curRemove = addDays(curRemove, applyEvery);
  }

  return rows;
}

/* =======================
   OUTPUT CHOICE
   ======================= */

function buildPlan() {
  const cls = $("classSelect").value;
  const med = $("medicineSelect").value;
  const form = $("formSelect").value;

  if (!cls || !med || !form) {
    showToast("Please select a class, medicine, and form first.");
    return;
  }

  let rows = [];
  if (/Patch/i.test(form)) {
    rows = buildPlanPatch();
    renderPatchTable(rows);
  } else {
    // tablets/capsules/ODT etc.
    rows = buildPlanTablets(); // your existing builder
    renderStandardTable(rows);
  }

  setGenerateEnabled(); // keep your existing guard enabling logic
  setDirty(false);
}

/* =======================
   UI: dose lines, header, footer
   ======================= */

function tabletsPhraseDigits(n) {
  // whole numbers as digits; partials in words
  const whole = Math.floor(n);
  const frac = n - whole;
  const words = (x) =>
    x === 0.25
      ? "a quarter"
      : x === 0.5
      ? "half"
      : x === 0.75
      ? "three quarters"
      : "";
  if (Math.abs(frac) < 1e-9) return `${whole} ${whole === 1 ? "tablet" : "tablets"}`;
  if (whole === 0) return `${words(frac)} a tablet`;
  return `${whole} and ${words(frac)} tablets`;
}

function updateRecommended() {
  const cls = $("classSelect")?.value || "";
  const med = $("medicineSelect")?.value || "";
  const form = $("formSelect")?.value || "";

  const box = $("bestPracticeBox");
  if (box) box.innerHTML = `<h2>Suggested practice for ${med} ${form}</h2>`;

  const hm = $("hdrMedicine");
  if (hm) hm.textContent = `Medicine: ${med} ${form}`;

  const hs = $("hdrSpecial");
  if (hs) hs.textContent = specialInstructionFor();

  setFooterText(cls);
}

/* render/manage dose lines */
function defaultFreq() {
  const form = $("formSelect").value || "";
  return /Patch/i.test(form) ? "PATCH" : "BID";
}
function strengthsForSelected() {
  // your existing lookup — keep it
  return []; // stub: replace with your catalog return
}
function parseMgFromStrength(s) {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*mg/);
  return m ? parseFloat(m[1]) : 0;
}
function parsePatchRate(s) {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*mcg\/hr/i);
  return m ? parseFloat(m[1]) : 0;
}

function renderDoseLines() {
  const wrap = $("doseLinesContainer");
  wrap.innerHTML = "";
  doseLines.forEach((ln) => {
    const row = document.createElement("div");
    row.className = "dose-line";

    // Strength (select)
    const sel = document.createElement("select");
    strengthsForSelected().forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === ln.strengthStr) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", (e) => {
      ln.strengthStr = e.target.value;
      dirty = true;
    });

    // Quantity (number)
    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "0";
    qty.max = /Patch/i.test($("formSelect").value) ? "2" : "4"; // caps you set
    qty.value = ln.qty ?? 1;
    qty.addEventListener("input", (e) => {
      ln.qty = clamp(parseFloat(e.target.value || "0"), 0, parseInt(qty.max, 10));
      dirty = true;
    });

    // Frequency (select)
    const freq = document.createElement("select");
    const form = $("formSelect").value || "";
    const isPatch = /Patch/i.test(form);
    const choices = isPatch
      ? [["PATCH", "Patches (interval fixed)"]]
      : [
          ["AM", "In the morning"],
          ["MID", "At midday"],
          ["DIN", "At dinner"],
          ["PM", "At night"],
          ["BID", "Twice a day"],
          ["TID", "Three times a day"],
          ["QID", "Four times a day"],
        ];
    choices.forEach(([val, label]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      if (val === ln.freqMode) o.selected = true;
      freq.appendChild(o);
    });
    freq.addEventListener("change", (e) => {
      ln.freqMode = e.target.value;
      dirty = true;
    });

    // Labels
    const lblStrength = document.createElement("label");
    lblStrength.textContent = "Strength";
    lblStrength.appendChild(sel);

    const lblQty = document.createElement("label");
    lblQty.textContent = /Patch/i.test(form) ? "Number of patches" : "Number of doses";
    lblQty.appendChild(qty);

    const lblFreq = document.createElement("label");
    lblFreq.textContent = "Frequency";
    lblFreq.appendChild(freq);

    row.appendChild(lblStrength);
    row.appendChild(lblQty);
    row.appendChild(lblFreq);
    wrap.appendChild(row);
  });
}

function resetDoseLinesToLowest() {
  const sList = strengthsForSelected();
  doseLines = [];
  if (sList && sList.length) {
    doseLines.push({
      id: nextLineId++,
      strengthStr: sList[0],
      qty: 1,
      freqMode: defaultFreq(),
    });
  }
  renderDoseLines();
}

/* =======================
   INIT / EVENTS
   ======================= */

function setDirty(v) {
  dirty = !!v;
}
function setGenerateEnabled() {
  const ok = $("p1Percent")?.value && $("p1Interval")?.value;
  $("generateBtn").disabled = !ok;
  $("printBtn").disabled = dirty;
  $("savePdfBtn").disabled = dirty;
}

function populateClasses() {
  // your existing catalogs
  const clsSel = $("classSelect");
  clsSel.innerHTML = "";
  ["Opioid", "Benzodiazepines / Z-Drug (BZRA)", "Antipsychotic", "Proton Pump Inhibitor", "Patch Class"]
    .forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      clsSel.appendChild(o);
    });
}
function populateMedicines() {
  // your existing mapping by class
  const sel = $("medicineSelect");
  sel.innerHTML = "";
  const cls = $("classSelect").value;
  const meds = cls === "Patch Class" ? ["Fentanyl", "Buprenorphine"] : ["Morphine", "Oxycodone / Naloxone", "Tramadol"]; // stub
  meds.forEach((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  });
}
function populateForms() {
  const sel = $("formSelect");
  sel.innerHTML = "";
  const med = $("medicineSelect").value;
  const forms = /Fentanyl|Buprenorphine/i.test(med)
    ? ["Patch"]
    : ["Slow Release Tablet", "Tablet", "Capsule"]; // stub
  forms.forEach((f) => {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = f;
    sel.appendChild(o);
  });
}

function watchDirty(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("input", () => setDirty(true));
    el.addEventListener("change", () => setDirty(true));
  });
}

function init() {
  // Date pickers
  document.querySelectorAll(".datepick").forEach((el) => {
    if (window.flatpickr) {
      window.flatpickr(el, { dateFormat: "Y-m-d", allowInput: true });
    } else {
      try {
        el.type = "date";
      } catch {}
    }
  });

  // clear Phase-1 inputs
  if ($("p1Percent")) {
    $("p1Percent").value = "";
    $("p1Percent").placeholder = "%";
  }
  if ($("p1Interval")) {
    $("p1Interval").value = "";
    $("p1Interval").placeholder = "days";
  }

  populateClasses();
  populateMedicines();
  populateForms();
  resetDoseLinesToLowest();
  updateRecommended();

  $("classSelect").addEventListener("change", () => {
    populateMedicines();
    populateForms();
    updateRecommended();
    resetDoseLinesToLowest();
    setFooterText($("classSelect")?.value);
    setDirty(true);
  });
  $("medicineSelect").addEventListener("change", () => {
    populateForms();
    updateRecommended();
    resetDoseLinesToLowest();
    setFooterText($("classSelect")?.value);
    setDirty(true);
  });
  $("formSelect").addEventListener("change", () => {
    updateRecommended();
    resetDoseLinesToLowest();
    setDirty(true);
  });

  $("addDoseLineBtn").addEventListener("click", () => {
    const sList = strengthsForSelected();
    doseLines.push({
      id: nextLineId++,
      strengthStr: sList[0],
      qty: 1,
      freqMode: defaultFreq(),
    });
    renderDoseLines();
    setDirty(true);
  });

  $("generateBtn").addEventListener("click", buildPlan);
  $("resetBtn").addEventListener("click", () => location.reload());
  $("printBtn").addEventListener("click", () => window.print());
  $("savePdfBtn").addEventListener("click", () => window.print()); // same pipeline

  watchDirty(
    "#classSelect, #medicineSelect, #formSelect, #startDate, #reviewDate, #p1Percent, #p1Interval, #p2Percent, #p2Interval, #p2StartDate"
  );

  setDirty(true);
  setGenerateEnabled();
  updateRecommended();
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (e) {
    console.error(e);
    alert("Init error: " + (e?.message || String(e)));
  }
});
