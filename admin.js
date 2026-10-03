const LS_KEY = "wedding-rsvp-guests-v5";
const ADMIN_PW = "12192026"; // change me
function normCode(s){
  // local-only: this function IS window.normCode, so never delegate to it.
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function cleanCode(s){ return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeGuest(g){
  const comps = Array.isArray(g.companions)
    ? g.companions
    : String(g.companions || "").split(/[;,\n]+/).map(c=>c.trim()).filter(Boolean);
  const st = String(g.status || "pending").toLowerCase();
  return {
    code: cleanCode(g.code),
    name: String(g.name || "").trim(),
    pax: Math.max(1, parseInt(g.pax, 10) || 1),
    side: String(g.side || "Both").trim() || "Both",
    table: String(g.table || "").trim(),
    status: (st === "attending" || st === "confirmed") ? "attending" : st === "declined" ? "declined" : "pending",
    companions: comps.map(c=>String(c).trim()).filter(Boolean),
    contact: String(g.contact || "").trim(),
    message: String(g.message || "").trim()
  };
}
function loadGuests(){
  try{
    const r=localStorage.getItem(LS_KEY);
    if(r) return JSON.parse(r).map(normalizeGuest);
  }catch{}
  const s=structuredClone(window.SEED_GUESTS).map(normalizeGuest);
  localStorage.setItem(LS_KEY, JSON.stringify(s)); return s;
}
function save(g){ localStorage.setItem(LS_KEY, JSON.stringify(g)); }
function normName(s){ return (s||"").toLowerCase().trim().replace(/\s+/g," "); }
function findByCode(list, code){ const n=normCode(code); return list.findIndex(x=>normCode(x.code)===n); }
function seatsUsed(g){
  // local-only: this function IS window.seatsUsed, so never delegate to it.
  if(!g) return 0;
  const s=String(g.status||"").toLowerCase();
  if(s==="declined") return 0;
  if(s==="attending"||s==="confirmed"){
    const comps = Array.isArray(g.companions)
      ? g.companions
      : String(g.companions || "").split(/[;,\n]+/).map(c=>c.trim()).filter(Boolean);
    return 1+comps.length;
  }
  return 0;
}
const useGas = ()=> !!(window.usingGas && window.usingGas());

let authed = sessionStorage.getItem("rsvp-admin")==="1";
let cache = [];      // in-memory list for rendering (from GAS or local)
let loading = false;
let gasError = "";
if(authed) showDash();

document.getElementById("loginBtn").onclick = ()=>{
  const v=document.getElementById("pw").value;
  if(v===ADMIN_PW){ sessionStorage.setItem("rsvp-admin","1"); showDash(); }
  else document.getElementById("loginMsg").innerHTML=`<div class="error">Wrong password.</div>`;
};

async function showDash(){
  document.getElementById("loginCard").style.display="none";
  document.getElementById("dash").style.display="block";
  await refresh();
}
document.getElementById("q").oninput=render;
document.getElementById("f").onchange=render;

async function refresh(){
  loading = true; gasError = ""; render();
  try{
    if(useGas()){
      const res = await window.gasGet({ action: "list", ...(window.GAS_KEY ? { key: window.GAS_KEY } : {}) });
      if(!res || !res.ok) throw new Error((res && res.error) || "list failed");
      cache = (res.guests || []).map(normalizeGuest);
      // keep a local copy as offline fallback
      try{ localStorage.setItem(LS_KEY, JSON.stringify(cache)); }catch{}
    } else {
      cache = loadGuests();
    }
  }catch(err){
    console.warn("admin refresh failed, using local cache:", err);
    gasError = String(err.message || err);
    cache = loadGuests();
  }finally{
    loading = false; render();
  }
}

function statusPill(s){
  const n=(s||"").toLowerCase();
  if(n==="attending"||n==="confirmed") return "ok";
  if(n==="declined") return "no";
  return "wait";
}
function statusLabel(s){
  const n=(s||"").toLowerCase();
  if(n==="attending"||n==="confirmed") return "Attending";
  if(n==="declined") return "Declined";
  return "Pending";
}
function isAttending(g){ return ["attending","confirmed"].includes(normName(g.status)); }
function isDeclined(g){ return normName(g.status)==="declined"; }
function esc(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function render(){
  const guests=cache;
  const qEl = document.getElementById("q");
  const fEl = document.getElementById("f");
  const qRaw=qEl ? (qEl.value||"") : "";
  const q=normName(qRaw);
  const qc=normCode(qRaw);
  const f=fEl ? fEl.value : "";
  const attending=guests.filter(isAttending);
  const declined=guests.filter(isDeclined);
  const pending=guests.filter(g=>!isAttending(g)&&!isDeclined(g));
  const headcount=attending.reduce((a,g)=>a+seatsUsed(g),0);
  const totalPax=guests.reduce((a,g)=>a+(g.pax||0),0);
  const liveBadge = useGas()
    ? `<span class="pill ok" title="Connected to Google Sheet">LIVE • Sheet</span>`
    : `<span class="pill wait" title="Local demo only">LOCAL DEMO</span>`;
  document.getElementById("stats").innerHTML=`
    <div class="stat"><b>${guests.length}</b><span class="muted">Guests</span></div>
    <div class="stat"><b>${totalPax}</b><span class="muted">Total seats</span></div>
    <div class="stat"><b style="color:var(--ok)">${headcount}</b><span class="muted">Attending headcount</span></div>
    <div class="stat"><b>${pending.length}</b><span class="muted">Pending</span></div>
    <div class="stat"><b>${declined.length}</b><span class="muted">Declined</span></div>
    <div class="stat">${liveBadge}<span class="muted">${loading ? "Loading…" : gasError ? "Sheet error: "+gasError : useGas() ? "Google Sheet connected" : "Set GAS_URL to go live"}</span></div>`;

  const rows=document.getElementById("rows");
  rows.innerHTML="";
  if(loading && !guests.length){
    rows.innerHTML = `<tr><td colspan="8" class="muted">Loading guest list from Google Sheet…</td></tr>`;
    return;
  }
  guests.filter(g=>{
    if(f==="attending" && !isAttending(g)) return false;
    if(f==="confirmed" && !isAttending(g)) return false; // legacy filter value
    if(f==="declined" && !isDeclined(g)) return false;
    if(f==="pending" && (isAttending(g)||isDeclined(g))) return false;
    if(q && !(normCode(g.code).includes(qc)||normName(g.name).includes(q)||normName(g.table||"").includes(q))) return false;
    return true;
  }).forEach(g=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><b style="font-family:monospace;white-space:nowrap">${esc(g.code)}</b></td>`
      + `<td><b>${esc(g.name)}</b><br/><span class="muted" style="font-size:12px">${esc(g.side)} • ${esc(g.contact)}${g.message?" • “"+esc(g.message)+"”":""}</span></td>
      <td>${g.pax}</td><td>${seatsUsed(g)}</td>
      <td><span class="pill ${statusPill(g.status)}">${statusLabel(g.status)}</span></td>
      <td style="font-size:13px">${esc((g.companions||[]).join("; "))||"—"}</td>
      <td>${esc(g.table||"")}</td><td></td>`;
    const td=tr.lastChild;
    td.style.whiteSpace="nowrap";
    const mk=(label,fn)=>{
      const b=document.createElement("button");
      b.className="btn small ghost"; b.textContent=label; b.style.marginRight="6px";
      b.onclick=fn; td.appendChild(b);
    };
    mk("Edit",()=>openModal(g.code));
    mk("Reset", async ()=>{
      if(useGas()){
        if(!confirm(`Reset ${g.name} (${g.code}) to pending?`)) return;
        try{
          await window.gasPost({ action: "upsert", guest: { ...g, status: "pending", companions: [], message: "" } });
          await refresh();
        }catch(e){ alert("Reset failed: " + (e.message||e)); }
        return;
      }
      const all=loadGuests(); const i=findByCode(all,g.code);
      if(i<0) return;
      all[i]={...all[i],status:"pending",companions:[],message:""}; save(all); cache=all; render();
    });
    mk("Delete", async ()=>{
      if(!confirm(`Delete ${g.name} (${g.code})? That code will stop working.`)) return;
      if(useGas()){
        try{
          await window.gasPost({ action: "delete", code: g.code });
          await refresh();
        }catch(e){ alert("Delete failed: " + (e.message||e)); }
        return;
      }
      const next=loadGuests().filter(x=>normCode(x.code)!==normCode(g.code)); save(next); cache=next; render();
    });
    rows.appendChild(tr);
  });
}
// ---- Add / Edit guest (CODE is the key) — mirrors all 9 sheet columns ----
let editingCode = null;
const modal = document.getElementById("modal");
function parseCompInput(s){ return String(s||"").split(/[;,\n]+/).map(c=>c.trim()).filter(Boolean); }
function uniqueCode(base){
  const taken = new Set(cache.map(g=>normCode(g.code)));
  let c = base;
  for(let i=0;i<10 && taken.has(normCode(c));i++){
    c = window.makeCode(document.getElementById("mName").value || "Guest", document.getElementById("mPax").value);
  }
  return c;
}
document.getElementById("mGenCode").onclick = ()=>{
  const nm = document.getElementById("mName").value || "Guest";
  const px = document.getElementById("mPax").value || 2;
  document.getElementById("mCode").value = uniqueCode(window.makeCode(nm, px));
};
function openModal(code){
  editingCode = code || null;
  const all = cache.length ? cache : loadGuests();
  const i = code ? findByCode(all, code) : -1;
  const g = i>=0 ? all[i] : null;
  document.getElementById("mTitle").textContent = g ? `Edit ${g.name} (${g.code})` : "Add guest";
  const codeEl = document.getElementById("mCode");
  codeEl.value = g ? g.code : "";
  codeEl.disabled = !!g; // CODE is the key — locked on edit (delete + re-add to change it)
  codeEl.title = g ? "Code is locked on edit — delete + re-add to change it" : "Unique per guest. Generate or type your own.";
  codeEl.placeholder = "e.g. CF4K7P";
  document.getElementById("mName").value = g ? g.name : "";
  document.getElementById("mPax").value = g ? g.pax : 2;
  document.getElementById("mSide").value = g ? g.side : "Bride";
  document.getElementById("mTable").value = g ? (g.table||"") : "";
  document.getElementById("mStatus").value = g ? (isAttending(g) ? "attending" : isDeclined(g) ? "declined" : "pending") : "pending";
  document.getElementById("mCompanions").value = g ? (g.companions||[]).join("; ") : "";
  document.getElementById("mContact").value = g ? (g.contact||"") : "";
  document.getElementById("mMessage").value = g ? (g.message||"") : "";
  document.getElementById("mMsg").innerHTML = "";
  modal.style.display = "flex";
  if(!g) setTimeout(()=>codeEl.focus(), 50);
}
function closeModal(){ modal.style.display = "none"; editingCode = null; }
document.getElementById("addBtn").onclick = ()=>openModal(null);
document.getElementById("mCancel").onclick = closeModal;
modal.addEventListener("click", e=>{ if(e.target===modal) closeModal(); });
document.getElementById("mSave").onclick = async ()=>{
  const msg = document.getElementById("mMsg");
  const saveBtn = document.getElementById("mSave");
  let code = cleanCode(document.getElementById("mCode").value);
  const name = (document.getElementById("mName").value||"").trim().replace(/\s+/g," ");
  const pax = Math.max(1, Math.min(20, parseInt(document.getElementById("mPax").value,10)||0));
  const side = document.getElementById("mSide").value;
  const table = (document.getElementById("mTable").value||"").trim();
  const status = document.getElementById("mStatus").value || "pending";
  let companions = parseCompInput(document.getElementById("mCompanions").value).slice(0, Math.max(0, pax-1));
  const contact = (document.getElementById("mContact").value||"").trim();
  const message = (document.getElementById("mMessage").value||"").trim();
  if(!editingCode && !code){
    // new guest without a code: auto-generate Initials+Pax+Random3
    code = uniqueCode(window.makeCode(name || "Guest", pax));
    document.getElementById("mCode").value = code;
  }
  if(!code){ msg.innerHTML = `<div class="error">Code is required — hit Generate.</div>`; return; }
  if(!/^[A-Z0-9]{3,20}$/.test(code)){ msg.innerHTML = `<div class="error">Code must be 3–20 letters/numbers, no spaces.</div>`; return; }
  if(!name){ msg.innerHTML = `<div class="error">Name is required.</div>`; return; }
  if(status === "declined") companions = [];

  if(useGas()){
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    try{
      const existing = editingCode ? cache.find(x=>normCode(x.code)===normCode(editingCode)) : null;
      if(!editingCode && cache.some(x=>normCode(x.code)===normCode(code))){
        msg.innerHTML = `<div class="error">Code "<b>${code}</b>" is already used.</div>`; return;
      }
      const guest = existing
        ? { ...existing, code: existing.code, name, pax, side, table, status, companions, contact, message }
        : { code, name, pax, side, table, status, companions, contact, message };
      const res = await window.gasPost({ action: "upsert", guest });
      if(!res || !res.ok) throw new Error((res && res.error) || "save failed");
      closeModal(); await refresh();
    }catch(e){
      msg.innerHTML = `<div class="error">Save failed: ${String(e.message||e)}</div>`;
    }finally{
      saveBtn.disabled = false; saveBtn.textContent = "Save Guest";
    }
    return;
  }

  const all = loadGuests();
  if(editingCode){
    const i = findByCode(all, editingCode);
    if(i<0) return;
    all[i] = {...all[i], name, pax, side, table, status, companions, contact, message};
  } else {
    if(findByCode(all,code)>=0){ msg.innerHTML = `<div class="error">Code "<b>${code}</b>" is already used.</div>`; return; }
    all.push({ code, name, pax, side, table, status, companions, contact, message });
  }
  save(all); cache=all; closeModal(); render();
};
