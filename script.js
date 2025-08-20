"use strict";

/* =============== tiny helpers =============== */
const $ = (id) => document.getElementById(id);

// AU format like your screenshots (e.g., "18 Aug 2025")
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const roundTo = (x, step) => Math.round(x / step) * step;
const MAX_WEEKS = 60;
const THREE_MONTHS_MS = 90 * 24 * 3600 * 1000;

/* =============== words for partial tablets =============== */
const WORDS_0_20 = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
                    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"];
const intWords = (n) => (n >= 0 && n <= 20) ? WORDS_0_20[n] : String(n);

/* q in quarter-tablets (1 = quarter, 2 = half, 3 = three quarters, 4 = one, …) */
function qToPhrase(q){
  const tabs = q/4; const whole = Math.floor(tabs+1e-6); const frac = +(tabs - whole).toFixed(2);
  if(frac===0) return whole===1 ? "one tablet" : `${intWords(whole)} tablets`;
  const tail = frac===0.25 ? "a quarter" : (frac===0.5 ? "a half" : "three quarters");
  return whole ? `${intWords(whole)} and ${tail} of a tablet` : `${tail} of a tablet`;
}
function qToCell(q){
  const tabs = q/4; const whole = Math.floor(tabs+1e-6); const frac = +(tabs - whole).toFixed(2);
  if(frac===0) return String(whole);
  if(whole===0) return frac===0.25 ? "quarter" : (frac===0.5 ? "half" : "three quarters");
  const tail = frac===0.25 ? "a quarter" : (frac===0.5 ? "a half" : "three quarters");
  return `${intWords(whole)} and ${tail}`;
}

/* =============== catalogue (commercial only) =============== */
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
    Lorazepam: { Tablet: ["1 mg","2.5 mg"] },         // 0.5 mg removed; use half of 1 mg
    Nitrazepam: { Tablet: ["5 mg"] },
    Oxazepam: { Tablet: ["15 mg","30 mg"] },
    Temazepam: { Tablet: ["10 mg"] },
    Zolpidem: { Tablet: ["10 mg"], "Slow Release Tablet": ["6.25 mg","12.5 mg"] }, // CR cannot be split
    Zopiclone: { Tablet: ["7.5 mg"] },
  },
  Antipsychotic: {
    Haloperidol: { Tablet: ["0.5 mg","1.5 mg","5 mg"] },
    Olanzapine: { Tablet: ["2.5 mg","5 mg","7.5 mg","10 mg","15 mg","20 mg"] },
    Quetiapine: { "Immediate Release Tablet": ["25 mg","100 mg","200 mg","300 mg"], "Slow Release Tablet": ["50 mg","150 mg","200 mg","300 mg","400 mg"] },
    Risperidone: { Tablet: ["0.5 mg","1 mg","2 mg","3 mg","4 mg"] },   // tablets only (no ODT/wafer)
  },
  "Proton Pump Inhibitor": {
    Esomeprazole: { Tablet: ["20 mg","40 mg"] },
    Lansoprazole: { Tablet: ["15 mg","30 mg"], Wafer: ["15 mg","30 mg"] },  // wafer = no split
    Omeprazole: { Capsule: ["10 mg","20 mg"], Tablet: ["10 mg","20 mg"] },
    Pantoprazole: { Tablet: ["20 mg","40 mg"] },
    Rabeprazole: { Tablet: ["10 mg","20 mg"] },
  },
};

// AP rounding (IR min step)
const AP_ROUND = { Haloperidol: 0.5, Risperidone: 0.25, Quetiapine: 12.5, Olanzapine: 1.25 };

// BZRA minimum allowed step (mg)
const BZRA_MIN_STEP = {
  Alprazolam: 0.25,
  Diazepam: 0.5,
  Flunitrazepam: 0.25,
  Lorazepam: 0.5,
  Nitrazepam: 1.25,
  Oxazepam: 3.75,
  Temazepam: 2.5,
  Zolpidem: 2.5,    // IR
  Zopiclone: 3.75,
  Clonazepam: 0.25,
};

/* =============== parsing =============== */
function isMR(form){ return /slow\s*release|modified|controlled|sustained/i.test(form) || /\b(SR|MR|CR|ER|XR|PR|CD)\b/i.test(form); }
function currentClass(){ return $("classSelect")?.value || ""; }
function parseMgFromStrength(s){
  if(!s) return 0;
  // For Oxycodone/Naloxone use the oxycodone component (text before "/")
  const lead = String(s).split("/")[0];
  const m = lead.match(/([\d.]+)\s*mg/i);
  return m ? parseFloat(m[1]) : 0;
}
function parsePatchRate(s){
  const m=String(s).match(/([\d.]+)\s*mcg\/hr/i); return m?parseFloat(m[1]):0;
}

/* strengths for current selection */
function strengthsForSelected(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  return (CATALOG[cls]?.[med]?.[form]||[]).slice();
}

/* =============== dropdowns & dose lines =============== */
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

/* dose lines */
let doseLines=[]; let nextLineId=1;

function canSplitTablets(cls, form, med){
  // No splitting for opioids & PPIs; no splitting of MR/capsule/wafer; Zolpidem CR cannot be split
  if(cls==="Opioid" || cls==="Proton Pump Inhibitor") return {half:false, quarter:false};
  if(isMR(form) || /Patch|Capsule|Wafer/i.test(form)) return {half:false, quarter:false};
  if(med==="Zolpidem" && /Slow Release/i.test(form)) return {half:false, quarter:false};
  return {half:true, quarter:true};
}

function defaultFreq(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  if(form==="Patch") return "PATCH";
  if(cls==="Benzodiazepines / Z-Drug (BZRA)") return "PM";           // night only
  if(cls==="Opioid" || (cls==="Antipsychotic" && isMR(form))) return "BID"; // morning+night for SR
  return "AM";
}
function slotsForFreq(mode){
  if(mode==="PATCH") return ["PATCH"];
  if(mode==="BID") return ["AM","PM"];
  if(mode==="AM") return ["AM"];
  if(mode==="MID") return ["MID"];
  if(mode==="DIN") return ["DIN"];
  if(mode==="PM") return ["PM"];
  return ["AM"];
}

function resetDoseLinesToLowest(){
  const list=strengthsForSelected().sort((a,b)=>parseMgFromStrength(a)-parseMgFromStrength(b));
  doseLines = [{ id: nextLineId++, strengthStr: list[0] || "", qty: 1, freqMode: defaultFreq() }];
  renderDoseLines();
}

function renderDoseLines(){
  // ✅ FIX: target the correct container from your HTML
  const box=$("doseLinesContainer"); if(!box) return; box.innerHTML="";
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;

  doseLines.forEach((ln, idx)=>{
    const row=document.createElement("div"); row.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0";
    row.innerHTML=`<span class="badge">Line ${idx+1}</span>
      <span>Strength:</span><select class="dl-strength" data-id="${ln.id}"></select>
      <span>Number of tablets:</span><input class="dl-qty" data-id="${ln.id}" type="number" step="0.25" min="0" value="${ln.qty??1}" style="width:110px" />
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
    } else if(cls==="Opioid" || (cls==="Antipsychotic" && isMR(form))){
      [["BID","Twice daily (morning & night)"]].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=true;
    } else {
      [["AM","Daily in the morning"],["MID","Daily at midday"],["DIN","Daily at dinner"],["PM","Daily at night"]]
        .forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; fSel.appendChild(o); });
      fSel.disabled=false;
    }
    fSel.value=ln.freqMode || fSel.options[0]?.value || "AM";

    sSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.strengthStr=e.target.value; };
    fSel.onchange=(e)=>{ const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id); if(l) l.freqMode=e.target.value; };
    row.querySelector(".dl-qty").onchange=(e)=>{
      const id=+e.target.dataset.id; const l=doseLines.find(x=>x.id===id);
      const split=canSplitTablets(cls,form,med); const step=(split.half||split.quarter)?0.25:1;
      let v=parseFloat(e.target.value); if(isNaN(v)) v=1; v=Math.max(0, Math.round(v/step)*step); e.target.value=v; if(l) l.qty=v;
    };
    row.querySelector(".dl-remove").onclick=(e)=>{ const id=+e.target.dataset.id; doseLines=doseLines.filter(x=>x.id!==id); renderDoseLines(); };
  });
}

/* =============== “Suggested practice” box =============== */
// 🔁 Reverted to simple heading only, per your request
function updateRecommended(){
  const cls=$("classSelect")?.value;
  const med=$("medicineSelect")?.value || "";
  const form=$("formSelect")?.value || "";
  const heading = med ? `Suggested practice for ${med} ${form}` : "Suggested practice";
  $("bestPracticeBox").innerHTML = `<h2>${heading}</h2>`;
  // Keep the output header line above the tables as-is:
  $("hdrMedicine").textContent = `Medicine: ${med} ${form}`;
  $("hdrSpecial").textContent = specialInstructionFor(med, form);
}

/* =============== misc helpers for logic below (unchanged from our earlier version) =============== */
function formLabelCapsSR(form){ return String(form||"").replace(/\bsr\b/ig,"SR"); }
function specialInstructionFor(med, form){
  return /Patch/i.test(form) ? "Special instruction: apply to intact skin as directed. Do not cut patches."
                              : "Swallow whole, do not halve or crush";
}

/* ======= arithmetic & composition helpers (unchanged) ======= */
function allowedPiecesMg(cls, med, form){
  const base = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0);
  const uniq=[...new Set(base)].sort((a,b)=>a-b);
  let pieces = uniq.slice();
  const split = canSplitTablets(cls,form,med);
  if(split.half||split.quarter){
    uniq.forEach(v=>{ if(split.half) pieces.push(+(v/2).toFixed(3)); if(split.quarter) pieces.push(+(v/4).toFixed(3)); });
  }
  return [...new Set(pieces)].sort((a,b)=>a-b);
}
function lowestStepMg(cls, med, form){
  if(cls==="Benzodiazepines / Z-Drug (BZRA)" && BZRA_MIN_STEP[med]) return BZRA_MIN_STEP[med];
  const mg = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b)[0]||0;
  const split = canSplitTablets(cls,form,med);
  return split.quarter ? +(mg/4).toFixed(3) : (split.half? +(mg/2).toFixed(3) : mg);
}
function composeExact(target, pieces){
  let rem=+target.toFixed(3), used={}; const arr=pieces.slice().sort((a,b)=>b-a);
  for(const s of arr){ const n=Math.floor(rem/s+1e-9); if(n>0){ used[s]=(used[s]||0)+n; rem=+(rem-n*s).toFixed(3); } }
  return Math.abs(rem)<1e-6 ? used : null;
}
function composeExactOrLower(target, pieces, step){
  const exact = composeExact(target, pieces); if(exact) return exact;
  for(let t=target; t>=0; t=+(t-step).toFixed(3)){
    const u = composeExact(t, pieces); if(u) return u;
  }
  return {};
}
function packsTotalMg(p){ const s=k=>Object.entries(p[k]||{}).reduce((a,[mg,c])=>a+mg*c,0); return s("AM")+s("MID")+s("DIN")+s("PM"); }
function removeFromPackByMg(pack, amount){
  let toDrop=+amount.toFixed(3);
  const sizes=Object.keys(pack).map(parseFloat).sort((a,b)=>b-a);
  for(const p of sizes){
    while(toDrop>0 && pack[p]>0){ pack[p]-=1; if(pack[p]===0) delete pack[p]; toDrop=+(toDrop-p).toFixed(3); }
    if(toDrop<=0) break;
  }
  return Math.max(0,toDrop);
}

function buildPacksFromDoseLines(){
  const cls=currentClass(), med=$("medicineSelect").value, form=$("formSelect").value;
  const packs={AM:{},MID:{},DIN:{},PM:{}};
  const add=(slot,mg,count)=>{ packs[slot][mg]=(packs[slot][mg]||0)+count; };

  doseLines.forEach(ln=>{
    const baseMg = parseMgFromStrength(ln.strengthStr);
    const qty = parseFloat(ln.qty||1);
    const slots = (ln.freqMode==="PATCH") ? [] : (ln.freqMode==="BID" ? ["AM","PM"] : [ln.freqMode]);
    slots.forEach(sl=>{
      const split=canSplitTablets(cls,form,med);
      if(split.half||split.quarter){ const qMg=+(baseMg/4).toFixed(3); const qCount=Math.round(qty*4); add(sl,qMg,qCount); }
      else { add(sl,baseMg,Math.round(qty)); }
    });
  });

  if(cls==="Benzodiazepines / Z-Drug (BZRA)"){ packs.AM={}; packs.MID={}; packs.DIN={}; }
  return packs;
}

/* ===== step calculators ===== */
function splitDailyPreferred(total, strengthsAsc){
  const strengths=strengthsAsc.slice().sort((a,b)=>a-b);
  const step=strengths[0]||1;
  const half=Math.floor(total/2);
  for(let amT=half; amT>=0; amT--){
    const pmT=total-amT;
    const am=composeExactOrLower(amT,strengths,step);
    const pm=composeExactOrLower(pmT,strengths,step);
    if(Object.keys(am).length || Object.keys(pm).length){
      return {AM:am, PM:pm};
    }
  }
  const all=composeExactOrLower(total,strengths,step);
  return {AM:{}, PM:all};
}
function opioidOrPpiStep(packs, percent){
  const total=packsTotalMg(packs); if(total<=0.0001) return packs;
  const strengths=strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const step=strengths[0]||1;
  let target=roundTo(total*(1-percent/100), step);
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  const bid=splitDailyPreferred(target,strengths);
  return { AM:bid.AM, MID:{}, DIN:{}, PM:bid.PM };
}
function antipsychoticStep(packs, percent, med, form){
  const isIR = !/Slow\s*Release/i.test(form) && !/\bSR\b/i.test(form);
  if(!isIR) return opioidOrPpiStep(packs,percent);
  const total=packsTotalMg(packs); if(total<=0.0001) return packs;
  const step=AP_ROUND[med] || lowestStepMg("Antipsychotic",med,form) || 0.5;
  let target=roundTo(total*(1-percent/100), step);
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  let toDrop=+(total-target).toFixed(3);
  for(const key of ["MID","DIN","AM","PM"]){ if(toDrop<=1e-6) break; toDrop = removeFromPackByMg(packs[key], toDrop); }
  return packs;
}
function bzraStep(packs, percent, med, form){
  const total=packsTotalMg(packs); if(total<=0.0001) return packs;
  const pieces=allowedPiecesMg("Benzodiazepines / Z-Drug (BZRA)",med,form);
  const step=BZRA_MIN_STEP[med] || lowestStepMg("Benzodiazepines / Z-Drug (BZRA)",med,form) || 0.125;
  let target = total*(1-percent/100);
  const down = roundTo(Math.floor(target/step+1e-9)*step, step);
  const up   = roundTo(Math.ceil (target/step-1e-9)*step, step);
  target = (Math.abs(up-target) < Math.abs(target-down)) ? up : down; // prefer up on tie
  if(target===total && total>0){ target=Math.max(0,total-step); target=roundTo(target,step); }
  const pm=composeExactOrLower(target,pieces,step);
  return { AM:{}, MID:{}, DIN:{}, PM:pm };
}

/* =============== plan builders =============== */
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
  const end={complete:false, hit3mo:false, hitReview:false, hitP1Stop:false};
  const applyStep=()=>{ if(cls==="Opioid"||cls==="Proton Pump Inhibitor") packs=opioidOrPpiStep(packs,p1Pct);
                       else if(cls==="Benzodiazepines / Z-Drug (BZRA)") packs=bzraStep(packs,p1Pct,med,form);
                       else packs=antipsychoticStep(packs,p1Pct,med,form); };

  // First visible row = first reduction on the start date
  applyStep();
  if(packsTotalMg(packs)>0.0001){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }

  while(packsTotalMg(packs)>0.0001){
    if(p1Stop && p2Pct===0 && p2Int===0 && week>=p1Stop){ end.hitP1Stop=true; break; }
    const nextDate=addDays(date,p1Int);
    if(reviewDate && nextDate>=reviewDate){ date=nextDate; end.hitReview=true; break; }
    if((+nextDate - +startDate) >= THREE_MONTHS_MS){ date=nextDate; end.hit3mo=true; break; }
    date=nextDate; week++;

    const isPhase2 = (p2Pct>0 && p2Int>0 && week>(p1Stop||0));
    if(isPhase2){
      packs=(cls==="Opioid"||cls==="Proton Pump Inhibitor")?opioidOrPpiStep(packs,p2Pct)
          :(cls==="Benzodiazepines / Z-Drug (BZRA)")?bzraStep(packs,p2Pct,med,form)
          :antipsychoticStep(packs,p2Pct,med,form);
      if(packsTotalMg(packs)>0.0001){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }
      continue;
    }

    applyStep();
    if(packsTotalMg(packs)>0.0001){ rows.push({week,date:fmtDate(date),packs:deepCopy(packs),med,form,cls}); }
    if(week>MAX_WEEKS){ break; }
  }

  if(packsTotalMg(packs)<=0.0001){ rows.push({week:week+1,date:fmtDate(date),packs:{},med,form,cls,stop:true}); }
  else if(end.hit3mo || end.hitReview || end.hitP1Stop){
    rows.push({week:week+1,date:fmtDate(date),packs:{},med,form,cls,review:true});
  }
  return rows;
}

/* =============== patches builder (apply/remove columns kept) =============== */
function normalizePatchDisplay(med, used){
  const avail = (med==="Fentanyl") ? [12,25,50,75,100] : [5,10,15,20,25,30,40];
  const sorted = used.slice().sort((a,b)=>b-a);
  const out=[];
  let rem=sorted.reduce((a,b)=>a+b,0);
  for(const a of avail.slice().sort((a,b)=>b-a)){
    while(rem >= a-1e-6){ out.push(a); rem -= a; }
  }
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
  const changeDays=(med==="Fentanyl")?3:7;

  const reducePct=clamp(parseFloat($("p1Percent")?.value||"0"),1,100);
  const reduceEvery=Math.max(1, parseInt($("p1Interval")?.value|| (med==="Fentanyl"?"3":"7"),10));

  const strengths=strengthsForSelected().map(parsePatchRate).filter(v=>v>0).sort((a,b)=>b-a);
  const smallest=strengths[strengths.length-1];
  let total=0; doseLines.forEach(ln=> total += parsePatchRate(ln.strengthStr)||0 ); if(total<=0) total=smallest;

  const firstTarget = Math.max(smallest, Math.ceil(total*(1 - reducePct/100)));
  let current = (firstTarget===total) ? nextLowerAvail(total, med) : firstTarget;

  const rows=[]; let date=new Date(startDate); let week=1;
  let nextReductionDate = addDays(date, reduceEvery);
  let heldSmallest = false;

  while(true){
    rows.push({ week, date:fmtDate(date), patches: normalizePatchDisplay(med,[current]), med, form:"Patch" });

    const nextDate = addDays(date, changeDays);
    const hitReview = (reviewDate && nextDate>=reviewDate);
    const hit3mo = ((+nextDate - +startDate) >= THREE_MONTHS_MS);
    if(hitReview || hit3mo){ rows.push({ week:week+1, date:fmtDate(nextDate), patches:[], med, form:"Patch", review:true }); break; }

    if(+nextDate >= +nextReductionDate){
      let target = Math.max(smallest, Math.ceil(current*(1 - reducePct/100)));
      if(target===current) target = nextLowerAvail(current, med);
      if(target<=smallest){
        if(heldSmallest){ rows.push({ week:week+1, date:fmtDate(nextDate), patches:[], med, form:"Patch", stop:true }); break; }
        heldSmallest = true;
      }
      current = target;
      nextReductionDate = addDays(nextReductionDate, reduceEvery);
    }

    date=nextDate; week++; if(week>MAX_WEEKS) break;
  }
  return rows;
}

/* oxy/nx label using oxycodone component; prefer single marketed pair if matches total */
function oxyNxPairLabel(oxyMg){
  const list = (CATALOG["Opioid"]["Oxycodone / Naloxone"]["SR Tablet"] || []);
  const hit = list.find(s=>{
    const lead = String(s).split("/")[0];
    const m = lead.match(/([\d.]+)\s*mg/i);
    return m && parseFloat(m[1]) === +oxyMg;
  });
  const pair = hit ? hit.replace(/\s*mg.*$/i, " mg") : `${oxyMg}/${(oxyMg/2)} mg`;
  return `Oxycodone / Naloxone ${pair} SR Tablet`;
}

/* BZRA & AP-IR fractional rows renderer */
function perStrengthRowsFractional(r){
  const baseAsc = strengthsForSelected().map(parseMgFromStrength).filter(v=>v>0).sort((a,b)=>a-b);
  const baseDesc = baseAsc.slice().sort((a,b)=>b-a);
  const byBase = {};
  const addQ = (b,slot,q)=>{ byBase[b]=byBase[b]||{AM:0,MID:0,DIN:0,PM:0}; byBase[b][slot]+=q; };

  ["AM","MID","DIN","PM"].forEach(slot=>{
    Object.entries(r.packs[slot]||{}).forEach(([pieceStr, count])=>{
      const piece=+pieceStr;
      let matchedBase=null, qPerPiece=0;
      for(const b of baseDesc){
        if(Math.abs(piece-b)<1e-6){ matchedBase=b; qPerPiece=4; break; }
        if(Math.abs(piece-b/2)<1e-6){ matchedBase=b; qPerPiece=2; break; }
        if(Math.abs(piece-b/4)<1e-6){ matchedBase=b; qPerPiece=1; break; }
      }
      if(matchedBase==null){ matchedBase=baseDesc[0]; qPerPiece=Math.max(1, Math.round(piece/(matchedBase/4))); }
      addQ(matchedBase, slot, qPerPiece*count);
    });
  });

  const rows=[];
  const mk = (q)=> q ? qToCell(q) : "";
  const bases = Object.keys(byBase).map(parseFloat).sort((a,b)=>{
    const aHasAM = byBase[a].AM>0, bHasAM = byBase[b].AM>0;
    if(aHasAM!==bHasAM) return aHasAM ? -1 : 1;
    return b-a;
  });
  bases.forEach(b=>{
    const q=byBase[b], lines=[];
    if(q.AM) lines.push(`Take ${qToPhrase(q.AM)} in the morning`);
    if(q.MID) lines.push(`Take ${qToPhrase(q.MID)} at midday`);
    if(q.DIN) lines.push(`Take ${qToPhrase(q.DIN)} at dinner`);
    if(q.PM) lines.push(`Take ${qToPhrase(q.PM)} at night`);
    rows.push({
      strengthLabel: `${r.med} ${b} mg ${/Tablet$/i.test(r.form)?"Tablet":formLabelCapsSR(r.form)}`,
      instructions: lines.join("\n"),
      am: mk(q.AM), mid: mk(q.MID), din: mk(q.DIN), pm: mk(q.PM)
    });
  });
  return rows;
}

/* =============== renderers =============== */
function td(text, cls){ const el=document.createElement("td"); if(cls) el.className=cls; el.textContent=text||""; return el; }

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

    if(r.cls==="Benzodiazepines / Z-Drug (BZRA)" || (r.cls==="Antipsychotic" && !/\bSR\b|Slow\s*Release/i.test(r.form))){
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

    const packs=r.packs;
    const allMg=new Set(); ["AM","MID","DIN","PM"].forEach(k=>Object.keys(packs[k]||{}).forEach(m=>allMg.add(+m)));
    const mgList=Array.from(allMg);
    if(mgList.length===0) return;

    // same-date ordering: morning first → higher strength first
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
      if(am) instr.push(`Take ${am===1?"1":am} ${am===1?"tablet":"tablets"} in the morning`);
      if(mid) instr.push(`Take ${mid===1?"1":mid} ${mid===1?"tablet":"tablets"} at midday`);
      if(din) instr.push(`Take ${din===1?"1":din} ${din===1?"tablet":"tablets"} at dinner`);
      if(pm) instr.push(`Take ${pm===1?"1":pm} ${pm===1?"tablet":"tablets"} at night`);

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
  schedule.appendChild(table);
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
    tr.appendChild(td(fmtDate(addDays(new Date(r.date), everyDays))));
    tr.appendChild(td((normalizePatchDisplay(r.med, r.patches)||[]).map(v=>`${v} mcg/hr`).join(" + ")));
    tr.appendChild(td(r.stop ? "Stop." : r.review ? "Review with your doctor the ongoing plan." : `Apply patches every ${everyDays} days.`));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  patch.appendChild(table);
}

/* footer text (simple placeholders; you’ll swap your exact wording later if desired) */
function setFooterText(cls){
  const exp = {
    Opioid: "Expected benefits: Improved function and reduced opioid-related harms.",
    "Benzodiazepines / Z-Drug (BZRA)": "Expected benefits: Improved cognition, daytime alertness, and reduced falls.",
    "Proton Pump Inhibitor": "Expected benefits: Reduced pill burden; review at 4–12 weeks.",
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

/* printing/pdf (output section only — unchanged) */
function printOutputOnly(){
  const el=$("outputCard"); const w=window.open("", "_blank"); if(!w){ alert("Popup blocked."); return; }
  const css=`<style>
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#000;background:#fff;margin:16px;}
    table{width:100%;border-collapse:separate;border-spacing:0 6px}
    thead th{text-align:left;padding:8px;border-bottom:1px solid #ddd}
    tbody td{border:1px solid #ddd;padding:8px;vertical-align:top}
    .instructions-pre{white-space:pre-line}
    @page{size:A4;margin:12mm}
  </style>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${el.outerHTML}</body></html>`);
  w.document.close(); w.focus(); w.print(); w.close();
}
function saveOutputAsPdf(){
  const el=$("outputCard");
  if(typeof html2pdf==="function"){
    html2pdf().set({ filename:"taper_plan.pdf", margin:10, image:{type:"jpeg",quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:"mm",format:"a4",orientation:"portrait"} }).from(el).save();
  } else { alert("PDF library not loaded."); }
}

/* =============== build & init =============== */
function buildPlan(){
  const cls=$("classSelect")?.value, med=$("medicineSelect")?.value, form=$("formSelect")?.value;
  if(!cls||!med||!form){ alert("Please select medicine class, medicine, and form."); return; }
  $("hdrMedicine").textContent=`Medicine: ${med} ${form}`; $("hdrSpecial").textContent=`${specialInstructionFor(med, form)}`;
  const isPatch=(form==="Patch"); const rows=isPatch?buildPlanPatch():buildPlanTablets();
  if(isPatch) renderPatchTable(rows); else renderStandardTable(rows);
  setFooterText(cls);
}

function updateRecommendedAndLines(){
  populateMedicines(); populateForms(); updateRecommended(); resetDoseLinesToLowest();
}

function init(){
  document.querySelectorAll(".datepick").forEach(el=>{
    if(window.flatpickr){ window.flatpickr(el, {dateFormat:"Y-m-d",allowInput:true}); } else { el.type="date"; }
  });
  populateClasses(); updateRecommendedAndLines();

  $("classSelect").addEventListener("change", updateRecommendedAndLines);
  $("medicineSelect").addEventListener("change", ()=>{ populateForms(); updateRecommended(); resetDoseLinesToLowest(); });
  $("formSelect").addEventListener("change", ()=>{ updateRecommended(); resetDoseLinesToLowest(); });

  // ✅ FIX: this now renders new lines into #doseLinesContainer
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
