
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
// --- Copy defaults (used if JSON isn't found) ---
const DEFAULT_COPY = {
  disclaimer: "This is a guide only – follow the advice of your healthcare professional.",
  footerByClass: {
    "Opioid": {
      expectedBenefits: "Improved function and reduced opioid-related harms.",
      withdrawal: "Transient pain flare, cravings, mood changes."
    },
    "Benzodiazepines / Z-Drug (BZRA)": {
      expectedBenefits: "Improved cognition, daytime alertness, and reduced falls.",
      withdrawal: "Insomnia, anxiety, irritability."
    },
    "Antipsychotic": {
      expectedBenefits: "Lower risk of metabolic/extrapyramidal adverse effects.",
      withdrawal: "Sleep disturbance, anxiety, return of target symptoms."
    },
    "Proton Pump Inhibitor": {
      expectedBenefits: "Review at 4–12 weeks; incorporate non-drug strategies (sleep, diet, positioning).",
      withdrawal: "Rebound heartburn."
    }
  }
};
let COPY = DEFAULT_COPY;
async function loadCopy() {
  try {
    const res = await fetch("config/copy.json?v=2025-08-22-1", { cache: "no-store" });
    if (!res.ok) return; // keep defaults
    const data = await res.json();
    // shallow-merge with defaults so missing keys don't break anything
    COPY = {
      ...DEFAULT_COPY,
      ...data,
      footerByClass: { ...DEFAULT_COPY.footerByClass, ...(data.footerByClass || {}) }
    };
  } catch (_) {
    // network/parse issue: keep DEFAULT_COPY
  }
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
function setGenerateEnabled() {
  const p1Pct = parseFloat($("p1Percent")?.value || "");
  const p1Int = parseInt($("p1Interval")?.value || "", 10);
  const gen   = $("generateBtn");
  const ready = Number.isFinite(p1Pct) && p1Pct > 0 && Number.isFinite(p1Int) && p1Int > 0;
  if (gen) gen.disabled = !ready;
}
function setDisclaimerFromCopy(){
  const txt = COPY.disclaimer || DEFAULT_COPY.disclaimer;
  // Try an existing placeholder if you already added one:
  const spot = document.getElementById("disclaimerLine");
  if (spot) { spot.textContent = txt; return; }
  // If no placeholder exists, we add it under your output header safely:
  const output = document.getElementById("outputCard") || document.body;
  const p = document.createElement("p");
  p.id = "disclaimerLine";
  p.textContent = txt;
  p.style.margin = "8px 0 16px 0";
  p.style.fontSize = "12px";
  p.style.opacity = "0.8";
  output.insertBefore(p, output.firstChild); // top of output card
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
/* ===== Dose-form nouns for labels/instructions ===== */
function doseFormNoun(form) {
  if (/Patch/i.test(form)) return "patches";
  if (/Capsule/i.test(form)) return "capsules";
  if (/Orally\s*Dispersible\s*Tablet/i.test(form)) return "orally dispersible tablets";
  return "tablets";
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
  const list=strengthsForSelected().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
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
  if (cls==="Proton Pump Inhibitor" && /La
// Pick "Suggested practice" text from JSON in order of specificity:
// byMedicineForm -> byForm -> byClass -> default
function practiceTextFromCopy(cls, med, form){
  const PT = COPY.practiceText || {};
  const key = `${med}|${form}`;
  let val = PT.byMedicineForm && PT.byMedicineForm[key];
  if (val == null) val = PT.byForm && PT.byForm[form];
  if (val == null) val = PT.byClass && PT.byClass[cls];
  if (val == null) val = PT.default;
  if (Array.isArray(val)){
    return {
      html: `<ul style="margin:8px 0 0 18px;">${val.map(x => `<li>${x}</li>`).join("")}</ul>`,
      text: val.join(" • ")
    };
  }
  if (typeof val === "string"){
    return { html: val, text: val };
  }
  return { html: "", text: "" };
}
nsoprazole/i.test(med) && /Orally\s*Dispersible\s*Tablet/i.test(form)) {
    return "The orally dispersible tablet can be dispersed in the mouth.";
  }
  return "Swallow whole, do not halve or crush";
}

function updateRecommended(){
  const cls = $("classSelect")?.value || "";
  const med = $("medicineSelect")?.value || "";
  const form = $("formSelect")?.value || "";

  const box = $("bestPracticeBox");
  if (box) {
    const pt = practiceTextFromCopy(cls, med, form);
    box.innerHTML = `<h2>Suggested practice for ${med} ${form}</h2>${pt.html ? `<div class="suggested-text">${pt.html}</div>` : ""}`;
  }

  const hm = $("hdrMedicine"); if (hm) hm.textContent = `Medicine: ${med} ${form}`;
  const hs = $("hdrSpecial");
  if (hs) {
    const pt = practiceTextFromCopy(cls, med, form);
    hs.textContent = pt.text || specialInstructionFor();
  }
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
  const sums = combosUpTo(avail, 2); // ≤2 patches
  const desired = (med === "Fentanyl") ? fentanylDesiredGrid(target) : target;
  const cand = [...sums.keys()].filter(t => t <= prevTotal + EPS);
  if (cand.length === 0) return { total: prevTotal, combo: [prevTotal] };
  cand.sort((a,b)=>{
    const da=Math.abs(a-desired), db=Math.abs(b-desired);
    if (Math.abs(da-db) > 1e-9) return da - db;
    return b - a; // prefer higher on tie
  });
  let pick = cand[0];
  let combo = sums.get(pick) || [pick];
  if (med === "Fentanyl"){
    const singleExact = avail.find(x => Math.abs(x - pick) < 1e-9);
    const singlePlus1 = avail.find(x => Math.abs(x - (pick+1)) < 1e-9);
    if (singleExact != null) combo = [singleExact];
    else if (singlePlus1 != null && (pick+1) < prevTotal - 1e-9){
      pick = singlePlus1; combo = [singlePlus1];
    }
  }
  if (Math.abs(pick - prevTotal) < 1e-9){
    const lower = cand.find(x => x < prevTotal - 1e-9);
    if (lower != null){ pick = lower; combo = sums.get(lower) || [lower]; }
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
      if(current <= smallest + 1e-9 && !smallestAppliedOn){
        smallestAppliedOn = new Date(curApply);
        stopThresholdDate = addDays(smallestAppliedOn, currentReduceEvery);
      }
      prevTotal = current;
    }
    if (startedReducing) pushRow();
    const candidateStop = (stopThresholdDate && (+curRemove >= +stopThresholdDate - 1e-9)) ? new Date(curRemove) : null;
    let finalType=null, finalDate=null;
    if (reviewDate && (!candidateStop || +reviewDate <= +candidateStop)) { finalType='review'; finalDate=new Date(reviewDate); }
    if (!finalDate && (+capDate <= +curRemove)) { finalType='review'; finalDate=new Date(capDate); }
    if (!finalDate && candidateStop) { finalType='stop'; finalDate=candidateStop; }
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
function renderStandardTable(rows){
  const schedule=$("scheduleBlock"), patch=$("patchBlock");
  patch.style.display="none"; schedule.style.display=""; schedule.innerHTML="";
  const table=document.createElement("table"); table.className="table";
  const thead=document.createElement("thead"); const hr=document.createElement("tr");
  ["Date beginning","Strength","Instructions","Morning","Midday","Dinner","Night"]
    .forEach(h=>{ const th=document.createElement("th"); th.textContent=h; hr.appendChild(th); });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody=document.createElement("tbody");
  rows.forEach((r, rowIdx)=>{
    if(!(r.stop || r.review)){
      const anyDose = ["AM","MID","DIN","PM"].some(k => r.packs && Object.keys(r.packs[k]||{}).length);
      if(!anyDose) return;
    }
    if(r.stop || r.review){
      const tr=document.createElement("tr");
      if((rowIdx%2)===1) tr.style.background="rgba(0,0,0,0.06)";
      tr.appendChild(td(r.date));
      tr.appendChild(td(""));
      tr.appendChild(td(r.stop ? "Stop." : "Review with your doctor the ongoing plan.","instructions-pre"));
      tr.appendChild(td("","center")); tr.appendChild(td("","center"));
      tr.appendChild(td("","center")); tr.appendChild(td("","center"));
      tbody.appendChild(tr);
      return;
    }
    if(r.cls==="Benzodiazepines / Z-Drug (BZRA)" || (r.cls==="Antipsychotic" && !isMR(r.form))){
      const lines = perStrengthRowsFractional(r);
      lines.forEach((ln,i)=>{
        const tr=document.createElement("tr");
        if((rowIdx%2)===1) tr.style.background="rgba(0,0,0,0.06)";
        tr.appendChild(td(i===0 ? r.date : ""));
        tr.appendChild(td(ln.strengthLabel));
        tr.appendChild(td(ln.instructions,"instructions-pre"));
        tr.appendChild(td(ln.am,"center")); tr.appendChild(td(ln.mid,"center"));
        tr.appendChild(td(ln.din,"center")); tr.appendChild(td(ln.pm,"center"));
        tbody.appendChild(tr);
      });
      return;
    }
    // whole-tablet classes (SR opioids / PPIs / AP-SR)
    const packs=r.packs;
    const allMg=new Set(); ["AM","MID","DIN","PM"].forEach(k=>Object.keys(packs[k]||{}).forEach(m=>allMg.add(+m)));
    const mgList=Array.from(allMg); if(mgList.length===0) return;
    mgList.sort((a,b)=>{
      const A = (packs.AM[a]||0)>0, B=(packs.AM[b]||0)>0;
      if(A!==B) return A ? -1 : 1;
      return b-a;
    });
    mgList.forEach((mg,i)=>{
      const tr=document.createElement("tr");
      if((rowIdx%2)===1) tr.style.background="rgba(0,0,0,0.06)";
      tr.appendChild(td(i===0 ? r.date : ""));
      const am=packs.AM[mg]||0, mid=packs.MID[mg]||0, din=packs.DIN[mg]||0, pm=packs.PM[mg]||0;
      const instr=[];
      if(am) instr.push(`Take ${am===1?"1":String(am)} ${am===1?"tablet":"tablets"} in the morning`);
      if(mid) instr.push(`Take ${mid===1?"1":String(mid)} ${mid===1?"tablet":"tablets"} at midday`);
      if(din) instr.push(`Take ${din===1?"1":String(din)} ${din===1?"tablet":"tablets"} at dinner`);
      if(pm) instr.push(`Take ${pm===1?"1":String(pm)} ${pm===1?"tablet":"tablets"} at night`);
      let strengthLabel = `${r.med} ${(+mg).toString().replace(/\.0+$/,"")} mg ${formLabelCapsSR(r.form)}`;
      if(r.med==="Oxycodone / Naloxone") strengthLabel = oxyNxPairLabel(+mg);
      tr.appendChild(td(strengthLabel));
      tr.appendChild(td(instr.join("\n"),"instructions-pre"));
      tr.appendChild(td(am?String(am):"","center"));
      tr.appendChild(td(mid?String(mid):"","center"));
      tr.appendChild(td(din?String(din):"","center"));
      tr.appendChild(td(pm?String(pm):"","center"));
      tbody.appendChild(tr);
    });
  });
  table.appendChild(tbody);
  $("scheduleBlock").appendChild(table);
}
function renderPatchTable(rows){
  // Find containers (self-heal if #patchBlock is missing)
  const schedule = $("scheduleBlock");
  let patch = $("patchBlock");
  if (!patch) {
    patch = document.createElement("div");
    patch.id = "patchBlock";
    patch.style.display = "none";
    if (schedule && schedule.parentNode) {
      schedule.parentNode.insertBefore(patch, schedule.nextSibling);
    } else {
      document.body.appendChild(patch);
    }
  }
  // Toggle visibility
  if (schedule) schedule.style.display = "none";
  patch.style.display = "";
  patch.innerHTML = "";
  // Build table shell
  const table = document.createElement("table");
  table.className = "table";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Apply on","Remove on","Patch strength(s)","Instructions"].forEach(h=>{
    const th=document.createElement("th"); th.textContent=h; hr.appendChild(th);
  });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = document.createElement("tbody");
  // Fentanyl = every 3 days, Buprenorphine = every 7 days
  const medName = ($("medicineSelect")?.value || "");
  const everyDays = /Fentanyl/i.test(medName) ? 3 : 7;
  if (!rows || rows.length === 0) {
    // Helpful fallback row if nothing generated
    const tr = document.createElement("tr");
    tr.appendChild(td("","center"));
    tr.appendChild(td("","center"));
    tr.appendChild(td("","center"));
    tr.appendChild(td("No patch rows generated — check Phase 1 % and that Number of patches ≥ 1.",""));
    tbody.appendChild(tr);
  } else {
    rows.forEach((r,rowIdx)=>{
      const tr=document.createElement("tr");
      if((rowIdx%2)===1) tr.style.background="rgba(0,0,0,0.06)";
      tr.appendChild(td(r.date || ""));                                       // Apply on
      tr.appendChild(td((r.stop||r.review) ? "" : (r.remove || "")));         // Remove on
      tr.appendChild(td((r.patches||[]).length ?                              // Patch strengths
        r.patches.map(v=>`${v} mcg/hr`).join(" + ") : ""
      ));
      // Instructions
      let instr="";
      if (r.stop)      instr="Stop.";
      else if (r.review) instr="Review with your doctor the ongoing plan.";
      else {
const n = (r.patches || []).length;
instr = `Apply ${n === 1 ? "patch" : "patches"} every ${everyDays} days.`;
      }
      tr.appendChild(td(instr));
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  patch.appendChild(table);
}
/* =================== Footer =================== *//* =================== Footer =================== */
function setFooterText(cls){
  const f = (COPY.footerByClass && COPY.footerByClass[cls]) || DEFAULT_COPY.footerByClass[cls];
  const exp = f?.expectedBenefits || "—";
  const wdr = f?.withdrawal || "—";
  const e = document.getElementById("expBenefits");     if (e) e.textContent = exp;
  const w = document.getElementById("withdrawalInfo");  if (w) w.textContent = wdr;
}
/* ===== Unified print/PDF styling + guards ===== */
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
function printOutputOnly(){
  if (_dirtySinceGenerate) { showToast("Inputs changed—please Generate to update the plan before printing or saving."); return; }
  const el=$("outputCard"); const w=window.open("", "_blank"); if(!w){ alert("Popup blocked."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">${_printCSS()}</head><body>${el.outerHTML}</body></html>`);
  w.document.close(); w.focus(); w.print(); w.close();
}
function saveOutputAsPdf(){ printOutputOnly(); }
/* =================== Build & init =================== */
function buildPlan(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  if(!cls||!med||!form){ alert("Please select medicine class, medicine, and form."); return; }
  $("hdrMedicine").textContent=`Medicine: ${med} ${form}`;
  $("hdrSpecial").textContent=`${specialInstructionFor()}`;
const medName = ($("medicineSelect")?.value || "");
const isPatch = /Patch/i.test(form) || /(Fentanyl|Buprenorphine)/i.test(medName);  const rows=isPatch?buildPlanPatch():buildPlanTablets();
  if(isPatch) renderPatchTable(rows); else renderStandardTable(rows);
  setFooterText(cls);
  setDirty(false);
}
function updateRecommendedAndLines(){
  populateMedicines(); populateForms(); updateRecommended(); resetDoseLinesToLowest();
  setFooterText($("classSelect")?.value);
  setDirty(true);
}
function init(){
  document.querySelectorAll(".datepick").forEach(el=>{
    if(window.flatpickr){ window.flatpickr(el, {dateFormat:"Y-m-d",allowInput:true}); } else { el.type="date"; }
  });
  if ($("p1Percent")) { $("p1Percent").value=""; $("p1Percent").placeholder="%"; }
  if ($("p1Interval")) { $("p1Interval").value=""; $("p1Interval").placeholder="days"; }
  populateClasses(); updateRecommendedAndLines();
  $("classSelect").addEventListener("change", updateRecommendedAndLines);
  $("medicineSelect").addEventListener("change", ()=>{ populateForms(); updateRecommended(); resetDoseLinesToLowest(); setFooterText($("classSelect")?.value); setDirty(true); });
  $("formSelect").addEventListener("change", ()=>{ updateRecommended(); resetDoseLinesToLowest(); setDirty(true); });
  $("addDoseLineBtn").addEventListener("click", ()=>{
    const sList=strengthsForSelected();
    doseLines.push({ id:nextLineId++, strengthStr:sList[0], qty:1, freqMode:defaultFreq() });
    renderDoseLines(); setDirty(true);
  });
  $("generateBtn").addEventListener("click", buildPlan);
  $("resetBtn").addEventListener("click", ()=>location.reload());
  $("printBtn").addEventListener("click", printOutputOnly);
  $("savePdfBtn").addEventListener("click", saveOutputAsPdf);
  watchDirty("#classSelect, #medicineSelect, #formSelect, #startDate, #reviewDate, #p1Percent, #p1Interval, #p2Percent, #p2Interval, #p2StartDate");
  setDirty(true);
  setGenerateEnabled();
  updateRecommended();
}
document.addEventListener("DOMContentLoaded", ()=>{
  loadCopy().finally(()=>{
    try {
      init();
      setDisclaimerFromCopy(); // puts the disclaimer under the header
    } catch(e){
      console.error(e);
      alert("Init error: " + (e?.message || String(e)));
    }
  });
});
