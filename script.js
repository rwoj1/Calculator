"use strict";

/* ====================== Helpers ====================== */
const $ = (id) => document.getElementById(id);
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const roundTo = (x, step) => Math.round(x / step) * step;
const MAX_WEEKS = 60;
const THREE_MONTHS_MS = 90 * 24 * 3600 * 1000;
const EPS = 1e-6;

/* ===== digits/words helpers ===== */
const WORDS_0_20 = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"];
const intWord = (n) => (n>=0 && n<=20 ? WORDS_0_20[n] : String(n));

/* cells: digits for whole, words for partial */
function qToCell(q){
  const tabs = q/4;
  const whole = Math.floor(tabs + 1e-6);
  const frac = +(tabs - whole).toFixed(2);
  if(frac===0) return String(whole);
  if(whole===0) return frac===0.5 ? "half" : (frac===0.25 ? "quarter" : "three quarters");
  const tail = frac===0.5 ? "and a half" : (frac===0.25 ? "and a quarter" : "and three quarters");
  return `${whole} ${tail}`;
}
/* instructions: digits for whole, words for partial */
function tabletsPhraseDigits(q){
  const tabs = q/4;
  const whole = Math.floor(tabs + 1e-6);
  const frac = +(tabs - whole).toFixed(2);
  if(frac===0) return `${whole===1?"1":String(whole)} ${whole===1?"tablet":"tablets"}`;
  if(frac===0.5){
    if(whole===0) return "half a tablet";
    return `${String(whole)} and a half tablets`;
  }
  const tail = frac===0.25 ? "a quarter" : "three quarters";
  return whole ? `${String(whole)} and ${tail} of a tablet` : `${tail} of a tablet`;
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
    Zolpidem: { Tablet: ["10 mg"], "Slow Release Tablet": ["12.5 mg","6.25 mg"] }, // CR cannot be split
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
    Lansoprazole: { Tablet: ["15 mg","30 mg"], Wafer: ["15 mg","30 mg"] },
    Omeprazole: { Capsule: ["10 mg","20 mg"], Tablet: ["10 mg","20 mg"] },
    Pantoprazole: { Tablet: ["20 mg","40 mg"] },
    Rabeprazole: { Tablet: ["10 mg","20 mg"] },
  },
};

/* ===== Rounding minima (BZRA halves-only confirmed) ===== */
const BZRA_MIN_STEP = {
  Alprazolam: 0.25,
  Diazepam: 1.0,
  Flunitrazepam: 0.5,
  Lorazepam: 0.5,
  Nitrazepam: 2.5,
  Oxazepam: 7.5,
  Temazepam: 5.0,
  Zolpidem: 5.0,      // IR
  Zopiclone: 3.75,
  Clonazepam: 0.25,
};
const AP_ROUND = { Haloperidol: 0.5, Risperidone: 0.5, Quetiapine: 12.5, Olanzapine: 1.25 };

/* =================== Parsing/labels =================== */
function isMR(form){ return /slow\s*release|modified|controlled|sustained/i.test(form) || /\b(SR|MR|CR|ER|XR|PR|CD)\b/i.test(form); }
function formLabelCapsSR(form){ return String(form||"").replace(/\bsr\b/ig,"SR"); }

function parseMgFromStrength(s){
  if(!s) return 0;
  const m = String(s).match(/^\s*([\d.]+)\s*(?:mg)?(?:\s*\/|$)/i);
  return m ? parseFloat(m[1]) : 0;
}
function parsePatchRate(s){
  const m=String(s).match(/([\d.]+)\s*mcg\/hr/i); return m?parseFloat(m[1]):0;
}

/* oxy/nal label using oxycodone component; prefer single marketed pair if available */
function oxyNxPairLabel(oxyMg){
  const list = (CATALOG["Opioid"]["Oxycodone / Naloxone"]["SR Tablet"] || []);
  const hit = list.find(s=>{
    const m = String(s).match(/^\s*([\d.]+)\s*(?:mg)?(?:\s*\/|$)/i);
    return m && parseFloat(m[1]) === +oxyMg;
  });
  const pair = hit ? hit.replace(/\s*mg.*$/i, " mg") : `${oxyMg}/${(oxyMg/2)} mg`;
  return `Oxycodone / Naloxone ${pair} SR Tablet`;
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
    const at=/Tablet/i.test(a)?0:/Patch/i.test(a)?1:/Capsule|Wafer/i.test(a)?2:9;
    const bt=/Tablet/i.test(b)?0:/Patch/i.test(b)?1:/Capsule|Wafer/i.test(b)?2:9;
    return at!==bt?at-b:a.localeCompare(b);
  });
  forms.forEach(f=>{ const o=document.createElement("option"); o.value=f; o.textContent=f; el.appendChild(o); });
}

/* ---- Dose lines (state) ---- */
let doseLines=[]; let nextLineId=1;

/* splitting rules */
function canSplitTablets(cls, form, med){
  if(/Patch|Capsule|Wafer/i.test(form) || isMR(form)) return {half:false, quarter:false};
  if(cls==="Opioid" || cls==="Proton Pump Inhibitor") return {half:false, quarter:false};
  if(cls==="Benzodiazepines / Z-Drug (BZRA)") return {half:true, quarter:false};       // halves only
  if(cls==="Antipsychotic") return {half:true, quarter:false};                          // IR halves only
  return {half:true, quarter:true};
}

/* default frequency */
function defaultFreq(){
  const cls=$("classSelect")?.value, form=$("formSelect")?.value;
  if(form==="Patch") return "PATCH";
  if(cls==="Benzodiazepines / Z-Drug (BZRA)") return "PM";     // night only
  if(cls==="Proton Pump Inhibitor") return "DIN";             // default dinner
  if(cls==="Opioid" || cls==="Antipsychotic") return "BID";   // BID default
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
    row.innerHTML=`<span class="badge">Line ${idx+1}</span>
      <span>Strength:</span><select class="dl-strength" data-id="${ln.id}"></select>
      <span>Number of tablets:</span><input class="dl-qty" data-id="${ln.id}" type="number" step="0.5" min="0" value="${ln.qty??1}" style="width:110px" />
      <span>Frequency:</span><select class="dl-freq" data-id="${ln.id}"></select>
      <button type="button" class="secondary dl-remove" data-id="${ln.id}">Remove</button>`;
    box.appendChild(row);

    const sSel=row.querySelector(".dl-strength");
    const sList=strengthsForSelected().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
    sSel.innerHTML=""; sList.forEach(s=>{ const o=document.createElement("option"); o.value=s; o.textContent=s; sSel.appendChild(o); });
    sSel.value=ln.strengthStr || sList[0];

    const fSel=row.querySelector(".dl-freq"); fSel.innerHTML="";
    if(form==="Patch"){
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

    sSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.strengthStr=e.target.value; };
    fSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.freqMode=e.target.value; };
    row.querySelector(".dl-qty").onchange=(e)=>{
      const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id);
      const split=canSplitTablets(cls,form,med);
      const step=(split.quarter?0.25:(split.half?0.5:1));
      let v=parseFloat(e.target.value); if(isNaN(v)) v=1;
      v=Math.max(0, Math.round(v/step)*step); e.target.value=v;
      if(l) l.qty=v;
    };
    row.querySelector(".dl-remove").onclick=(e)=>{ const id=+e.target.dataset.id; doseLines=doseLines.filter(x=>x.id!==id); renderDoseLines(); };
  });
}

/* =================== Suggested practice header =================== */
function specialInstructionFor(){
  const cls=$("classSelect")?.value, form=$("formSelect")?.value || "";
  if(cls==="Benzodiazepines / Z-Drug (BZRA)" || cls==="Antipsychotic") return ""; // remove per request
  return /Patch/i.test(form) ? "Special instruction: apply to intact skin as directed. Do not cut patches."
                              : "Swallow whole, do not halve or crush";
}
function updateRecommended(){
  const med=$("medicineSelect")?.value || "", form=$("formSelect")?.value || "";
  $("bestPracticeBox").innerHTML = `<h2>Suggested practice for ${med} ${form}</h2>`;
  $("hdrMedicine").textContent = `Medicine: ${med} ${form}`;
  $("hdrSpecial").textContent = specialInstructionFor();
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

/* ===== Split helpers for composing target totals ===== */
function splitDailyPreferred(target, strengths){
  const step=strengths[0]||1;
  const half=roundTo(target/2, step);
  // prefer smaller AM
  let amTarget = Math.min(half, target-half);
  let pmTarget = target - amTarget;
  const am = composeExactOrLower(amTarget, strengths, step);
  const usedAm = Object.entries(am).reduce((a,[m,c])=>a+m*c,0);
  const pm = composeExactOrLower(target-usedAm, strengths, step);
  return { AM:am, PM:pm };
}
function distributeToSlots(target, strengths, slots){
  const step=strengths[0]||1;
  const out={AM:{},MID:{},DIN:{},PM:{}};
  if(slots.length===1){
    out[slots[0]] = composeExactOrLower(target, strengths, step);
    return out;
  }
  if(slots.length===2 && slots.includes("AM") && slots.includes("PM")){
    const bid=splitDailyPreferred(target, strengths);
    out.AM=bid.AM; out.PM=bid.PM; return out;
  }
  // TID or QID: start equal split, put rounding “extra” into PM then DIN then MID then AM
  const weights = slots.map(()=>1);
  const sumW = weights.reduce((a,b)=>a+b,0);
  let remaining = target;
  const temp={};
  slots.forEach((slot,i)=>{
    const allot = (i===slots.length-1) ? remaining : roundTo(target*weights[i]/sumW, step);
    const comp = composeExactOrLower(allot, strengths, step);
    const used = Object.entries(comp).reduce((a,[m,c])=>a+m*c,0);
    temp[slot]=comp; remaining = +(remaining - used).toFixed(3);
  });
  // spill any remainder to slots in PM→DIN→MID→AM order
  for(const slot of ["PM","DIN","MID","AM"]){
    if(remaining<=EPS) break;
    if(!slots.includes(slot)) continue;
    const add = composeExactOrLower(remaining, strengths, step);
    const used = Object.entries(add).reduce((a,[m,c])=>a+m*c,0);
    // merge
    Object.entries(add).forEach(([m,c])=>{ temp[slot][m]=(temp[slot][m]||0)+c; });
    remaining = +(remaining-used).toFixed(3);
  }
  return {AM:temp.AM||{}, MID:temp.MID||{}, DIN:temp.DIN||{}, PM:temp.PM||{}};
}

/* ===== class-specific steppers ===== */
function stepOpioid_Recompose(packs, percent){
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const step=strengths[0]||1;
  const total=packsTotalMg(packs); if(total<=EPS) return packs;
  let target=roundTo(total*(1-percent/100), step);
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }

  // determine active slots from current regimen
  const active = ["AM","MID","DIN","PM"].filter(s=>Object.keys(packs[s]||{}).length>0);

  // enforce removal order: drop DIN then MID if >2 slots
  const pruned = active.filter(s=>s!=="DIN" && s!=="MID");
  let slots = active.slice();
  if(slots.length>2 && slots.includes("DIN")) slots = slots.filter(s=>s!=="DIN");
  if(slots.length>2 && slots.includes("MID")) slots = slots.filter(s=>s!=="MID");
  if(slots.length===0) slots = pruned.length?pruned:["PM"]; // fallback

  const out = distributeToSlots(target, strengths, slots);
  return out;
}
function stepPPI(packs, percent){
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const step=strengths[0]||1;
  const total=packsTotalMg(packs); if(total<=EPS) return packs;
  let target=roundTo(total*(1-percent/100), step);
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  // Removal order Night→Midday→Morning→Dinner is implicitly respected by distributing to current slots;
  // If multiple slots, bias distribution away from PM first when target falls:
  const active = ["AM","MID","DIN","PM"].filter(s=>Object.keys(packs[s]||{}).length>0);
  const out = distributeToSlots(target, strengths, active.length?active:["DIN"]);
  return out;
}
function stepAP(packs, percent, med, form){
  const isIR = !isMR(form);
  if(!isIR) return stepOpioid_Recompose(packs, percent); // SR like opioids
  const total=packsTotalMg(packs); if(total<=EPS) return packs;
  const step=AP_ROUND[med] || lowestStepMg("Antipsychotic",med,form) || 0.5;
  let target=roundTo(total*(1-percent/100), step);
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  // IR reduction order: Mid → Dinner → Morning → Night (night preserved last)
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  // decide slots to hold: remove MID then DIN if more than 2
  let slots = ["AM","MID","DIN","PM"].filter(s=>Object.keys(packs[s]||{}).length>0);
  if(slots.length>2 && slots.includes("MID")) slots = slots.filter(s=>s!=="MID");
  if(slots.length>2 && slots.includes("DIN")) slots = slots.filter(s=>s!=="DIN");
  if(slots.length===0) slots=["PM"];
  return distributeToSlots(target, strengths, slots);
}
function stepBZRA(packs, percent, med, form){
  const total=packsTotalMg(packs); if(total<=EPS) return packs;
  const pieces=allowedPiecesMg("Benzodiazepines / Z-Drug (BZRA)",med,form);
  const step=BZRA_MIN_STEP[med] || 0.5;
  let target = total*(1-percent/100);
  const down = roundTo(Math.floor(target/step+1e-9)*step, step);
  const up   = roundTo(Math.ceil (target/step-1e-9)*step, step);
  target = (Math.abs(up-target) < Math.abs(target-down)) ? up : down; // prefer up on tie
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  const pm=composeExactOrLower(target,pieces,step);
  return { AM:{}, MID:{}, DIN:{}, PM:pm };
}

/* =================== Plan builders (tablets) =================== */
const deepCopy = (o)=>JSON.parse(JSON.stringify(o));

function buildPlanTablets(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  const p1Pct=clamp(parseFloat($("p1Percent")?.value||"0"),1,100);
  const p1Int=Math.max(1, parseInt($("p1Interval")?.value||"7",10));
  const p1Stop=parseInt($("p1StopWeek")?.value||"0",10)||0;
  const p2Pct=clamp(parseFloat($("p2Percent")?.value||"0"),0,100);
  const p2Int=p2Pct?Math.max(1, parseInt($("p2Interval")?.value||"0",10)):0;
  const startDate=$("startDate")?($("startDate")._flatpickr?.selectedDates?.[0]||new Date()):new Date();
  const reviewDate=$("reviewDate")?($("reviewDate")._flatpickr?.selectedDates?.[0]||null):null;

  let packs=buildPacksFromDoseLines();
  if(packsTotalMg(packs)===0){
    const mg=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b)[0];
    if(mg) packs.PM[mg]=1;
  }

  const rows=[]; let date=new Date(startDate); let week=1;
  const end={ hit3mo:false, hitReview:false, hitP1Stop:false };

  const applyStep=()=>{
    if(cls==="Opioid") packs=stepOpioid_Recompose(packs,p1Pct);
    else if(cls==="Proton Pump Inhibitor") packs=stepPPI(packs,p1Pct);
    else if(cls==="Benzodiazepines / Z-Drug (BZRA)") packs=stepBZRA(packs,p1Pct,med,form);
    else packs=stepAP(packs,p1Pct,med,form);
  };

  // Step 1 on start date
  applyStep();
  if(packsTotalMg(packs)>EPS){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }

  while(packsTotalMg(packs)>EPS){
    if(p1Stop && p2Pct===0 && p2Int===0 && week>=p1Stop){ end.hitP1Stop=true; break; }
    const nextDate=addDays(date,p1Int);
    if(reviewDate && nextDate>=reviewDate){ date=nextDate; end.hitReview=true; break; }
    if((+nextDate - +startDate) >= THREE_MONTHS_MS){ date=nextDate; end.hit3mo=true; break; }
    date=nextDate; week++;

    const isPhase2 = (p2Pct>0 && p2Int>0 && week>(p1Stop||0));
    if(isPhase2){
      if(cls==="Opioid") packs=stepOpioid_Recompose(packs,p2Pct);
      else if(cls==="Proton Pump Inhibitor") packs=stepPPI(packs,p2Pct);
      else if(cls==="Benzodiazepines / Z-Drug (BZRA)") packs=stepBZRA(packs,p2Pct,med,form);
      else packs=stepAP(packs,p2Pct,med,form);
      if(packsTotalMg(packs)>EPS){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }
      continue;
    }

    applyStep();
    if(packsTotalMg(packs)>EPS){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }
    if(week>MAX_WEEKS) break;
  }

  if(packsTotalMg(packs)<=EPS){ rows.push({week:week+1,date:fmtDate(date),packs:{},med,form,cls,stop:true}); }
  else if(end.hit3mo || end.hitReview || end.hitP1Stop){ rows.push({week:week+1,date:fmtDate(date),packs:{},med,form,cls,review:true}); }
  return rows;
}

/* =================== Patches builder (Option B end-logic) =================== */
function normalizePatchDisplay(med, used){
  const avail = (med==="Fentanyl") ? [12,25,50,75,100] : [5,10,15,20,25,30,40];
  const sorted = used.slice().sort((a,b)=>b-a);
  const out=[]; let rem=sorted.reduce((a,b)=>a+b,0);
  for(const a of avail.slice().sort((a,b)=>b-a)){ while(rem >= a-1e-6){ out.push(a); rem -= a; } }
  if(out.length===0 && sorted.length){ out.push(sorted[sorted.length-1]); }
  const sum=out.reduce((x,y)=>x+y,0);
  if(avail.includes(sum)) return [sum];
  return out;
}
function nextLowerAvail(total, med){
  const avail = (med==="Fentanyl") ? [100,75,50,25,12] : [40,30,25,20,15,10,5];
  for(let i=0;i<avail.length;i++){
    if(total===avail[i]) return avail[i+1] ?? avail[i];
    if(total>avail[i]) return avail[i];
  }
  return avail[avail.length-1];
}
function buildPlanPatch(){
  const med=$("medicineSelect").value;
  const startDate=$("startDate")?($("startDate")._flatpickr?.selectedDates?.[0]||new Date()):new Date();
  const reviewDate=$("reviewDate")?($("reviewDate")._flatpickr?.selectedDates?.[0]||null):null;

  const changeDays=(med==="Fentanyl")?3:7;                       // apply/remove cadence
  const reducePct=clamp(parseFloat($("p1Percent")?.value||"0"),1,100);
  const reduceEvery=Math.max(1, parseInt($("p1Interval")?.value|| (med==="Fentanyl"?"3":"7"),10)); // reduction interval

  const strengths=strengthsForSelected().map(parsePatchRate).filter(v=>v>0).sort((a,b)=>b-a);
  const smallest=strengths[strengths.length-1];
  let total=0; doseLines.forEach(ln=> total += parsePatchRate(ln.strengthStr)||0 ); if(total<=0) total=smallest;

  const firstTarget = Math.max(smallest, Math.ceil(total*(1 - reducePct/100)));
  let current = (firstTarget===total) ? nextLowerAvail(total, med) : firstTarget;

  const rows=[]; let date=new Date(startDate); let week=1;
  let nextReductionDate = addDays(date, reduceEvery);
  let atSmallest = (current<=smallest);
  let finalEventDate = null;
  let finalEventType = "stop";

  const capDate = new Date(+startDate + THREE_MONTHS_MS);

  while(true){
    rows.push({ week, date:fmtDate(date), patches: normalizePatchDisplay(med,[current]), med, form:"Patch" });

    const nextDate = addDays(date, changeDays);

    if(finalEventDate && (+nextDate >= +finalEventDate)){
      rows.push({ week:week+1, date:fmtDate(finalEventDate), patches:[], med, form:"Patch", stop:(finalEventType==="stop"), review:(finalEventType==="review") });
      break;
    }

    if(!finalEventDate){
      let candidate = null, type = "stop";

      if(!atSmallest && (+nextDate >= +nextReductionDate)){
        let target = Math.max(smallest, Math.ceil(current*(1 - reducePct/100)));
        if(target===current) target = nextLowerAvail(current, med);
        current = target;
        if(current<=smallest){
          atSmallest = true;
          candidate = new Date(+nextReductionDate + reduceEvery*24*3600*1000); // one more reduction interval
          type = "stop";
        }
        nextReductionDate = addDays(nextReductionDate, reduceEvery);
      } else if(atSmallest && (+nextDate >= +nextReductionDate)){
        if(!finalEventDate){ candidate = new Date(+nextReductionDate + reduceEvery*24*3600*1000); type="stop"; }
        nextReductionDate = addDays(nextReductionDate, reduceEvery);
      }

      const firstCandidate = candidate;
      if(reviewDate && (!finalEventDate || (firstCandidate && +reviewDate < +firstCandidate))) { finalEventDate = reviewDate; finalEventType="review"; }
      if(!finalEventDate && candidate){ finalEventDate = candidate; finalEventType=type; }
      if(!finalEventDate || +capDate < +finalEventDate){ finalEventDate = capDate; finalEventType="review"; }
    }

    date=nextDate; week++; if(week>MAX_WEEKS) break;
  }
  return rows;
}

/* =================== Renderers =================== */
function td(text, cls){ const el=document.createElement("td"); if(cls) el.className=cls; el.textContent=text||""; return el; }

/* Group fractional classes by the SMALLEST marketed base first (no quarters if not allowed) */
function perStrengthRowsFractional(r){
  const baseAsc = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const split = canSplitTablets(r.cls, r.form, r.med);
  const byBase = {};
  const ensure = (b)=>{ byBase[b]=byBase[b]||{AM:0,MID:0,DIN:0,PM:0}; return byBase[b]; };

  const addQ = (b,slot,q)=>{ ensure(b)[slot]+=q; };

  ["AM","MID","DIN","PM"].forEach(slot=>{
    Object.entries(r.packs[slot]||{}).forEach(([pieceStr, count])=>{
      const piece=+pieceStr; let mapped=false;

      // Prefer exact multiples of SMALLER base (whole tablets) to avoid “quarter of big tablet”
      for(const b of baseAsc){ // ascending → smaller first
        const k = piece / b;
        if(Math.abs(k - Math.round(k)) < 1e-6){
          const kInt = Math.round(k);
          addQ(b, slot, 4 * kInt * count); // whole tablets of b
          mapped = true; break;
        }
      }
      if(mapped) return;

      // Then halves (if allowed) mapped to the smallest base producing a clean half
      if(split.half){
        for(const b of baseAsc){
          if(Math.abs(piece - b/2) < 1e-6){
            addQ(b, slot, 2 * count); // half of b
            mapped = true; break;
          }
        }
      }
      if(mapped) return;

      // Quarters only if allowed
      if(split.quarter){
        for(const b of baseAsc){
          if(Math.abs(piece - b/4) < 1e-6){
            addQ(b, slot, 1 * count); // quarter of b
            mapped = true; break;
          }
        }
      }
      if(mapped) return;

      // Fallback: map to smallest base using quarters units
      const b0 = baseAsc[0];
      const qApprox = Math.max(1, Math.round(piece/(b0/4)));
      addQ(b0, slot, qApprox * count);
    });
  });

  const rows=[];
  const mkCell = (q)=> q ? qToCell(q) : "";
  // Order: prefer lines that have Morning content first, then by higher strength
  const bases = Object.keys(byBase).map(parseFloat).sort((a,b)=>{
    const aHasAM = byBase[a].AM>0, bHasAM = byBase[b].AM>0;
    if(aHasAM!==bHasAM) return aHasAM ? -1 : 1;
    return b-a;
  });

  bases.forEach(b=>{
    const q=byBase[b], lines=[];
    if(q.AM) lines.push(`Take ${tabletsPhraseDigits(q.AM)} in the morning`);
    if(q.MID) lines.push(`Take ${tabletsPhraseDigits(q.MID)} at midday`);
    if(q.DIN) lines.push(`Take ${tabletsPhraseDigits(q.DIN)} at dinner`);
    if(q.PM) lines.push(`Take ${tabletsPhraseDigits(q.PM)} at night`);
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
        tr.appendChild(td(i===0 ? r.date : "")); // merged date
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
      tr.appendChild(td(i===0 ? r.date : "")); // merged date

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
  const schedule=$("scheduleBlock"), patch=$("patchBlock"); schedule.style.display="none"; patch.style.display=""; patch.innerHTML="";
  const table=document.createElement("table"); table.className="table";
  const thead=document.createElement("thead"); const hr=document.createElement("tr");
  ["Apply on","Remove on","Patch strength(s)","Instructions"].forEach(h=>{ const th=document.createElement("th"); th.textContent=h; hr.appendChild(th); });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody=document.createElement("tbody");
  const everyDays=($("medicineSelect").value==="Fentanyl")?3:7;

  rows.forEach((r,rowIdx)=>{
    const tr=document.createElement("tr"); if((rowIdx%2)===1) tr.style.background="rgba(0,0,0,0.06)";
    tr.appendChild(td(r.date));
    tr.appendChild(td((r.stop||r.review) ? "" : fmtDate(addDays(new Date(r.date), everyDays))));
    tr.appendChild(td((r.patches||[]).length ? (normalizePatchDisplay(r.med, r.patches)||[]).map(v=>`${v} mcg/hr`).join(" + ") : ""));
    tr.appendChild(td(r.stop ? "Stop." : r.review ? "Review with your doctor the ongoing plan." : `Apply patches every ${everyDays} days.`));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  patch.appendChild(table);
}

/* =================== Footer =================== */
function setFooterText(cls){
  const exp = {
    Opioid: "Expected benefits: Improved function and reduced opioid-related harms.",
    "Benzodiazepines / Z-Drug (BZRA)": "Expected benefits: Improved cognition, daytime alertness, and reduced falls.",
    "Proton Pump Inhibitor": "Expected benefits: Review at 4–12 weeks; incorporate non-drug strategies (sleep, diet, positioning).",
    Antipsychotic: "Expected benefits: Lower risk of metabolic/extrapyramidal adverse effects.",
  }[cls] || "—";
  const wdr = {
    Opioid: "Withdrawal: transient pain flare, cravings, mood changes.",
    "Benzodiazepines / Z-Drug (BZRA)": "Withdrawal: insomnia, anxiety, irritability.",
    "Proton Pump Inhibitor": "Withdrawal: rebound heartburn.",
    Antipsychotic: "Withdrawal: sleep disturbance, anxiety, return of target symptoms.",
  }[cls] || "—";
  $("expBenefits").textContent=exp; $("withdrawalInfo").textContent=wdr;
}

/* ===== Unified print/PDF styling ===== */
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
  const isPatch=(form==="Patch"); const rows=isPatch?buildPlanPatch():buildPlanTablets();
  if(isPatch) renderPatchTable(rows); else renderStandardTable(rows);
  setFooterText(cls);
}

function updateRecommendedAndLines(){
  populateMedicines(); populateForms(); updateRecommended(); resetDoseLinesToLowest();
  setFooterText($("classSelect")?.value); // keep class-specific footer live
}

function init(){
  document.querySelectorAll(".datepick").forEach(el=>{
    if(window.flatpickr){ window.flatpickr(el, {dateFormat:"Y-m-d",allowInput:true}); } else { el.type="date"; }
  });
  populateClasses(); updateRecommendedAndLines();

  $("classSelect").addEventListener("change", updateRecommendedAndLines);
  $("medicineSelect").addEventListener("change", ()=>{ populateForms(); updateRecommended(); resetDoseLinesToLowest(); setFooterText($("classSelect")?.value); });
  $("formSelect").addEventListener("change", ()=>{ updateRecommended(); resetDoseLinesToLowest(); });

  $("addDoseLineBtn").addEventListener("click", ()=>{
    const sList=strengthsForSelected();
    doseLines.push({ id:nextLineId++, strengthStr:sList[0], qty:1, freqMode:defaultFreq() });
    renderDoseLines();
  });

  $("generateBtn").addEventListener("click", buildPlan);
  $("resetBtn").addEventListener("click", ()=>location.reload());
  $("printBtn").addEventListener("click", printOutputOnly);
  $("savePdfBtn").addEventListener("click", saveOutputAsPdf);
  updateRecommended();
}
document.addEventListener("DOMContentLoaded", ()=>{ try{ init(); } catch(e){ console.error(e); alert("Init error: "+(e?.message||String(e))); }});
