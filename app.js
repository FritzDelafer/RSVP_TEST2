// Jess & Ara Wedding RSVP v2 — gate + RSVP form only.
// Accepts redirect to the Canva invitation; declines see thank-you + gift guide.
const LS_KEY = "wedding-rsvp-guests-v5";
const CANVA_URL = "https://jebscer16.my.canva.site/jess-ara-wedding/";

function loadGuests() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  let seed = [];
  try { seed = structuredClone(window.SEED_GUESTS || []); } catch {}
  try { localStorage.setItem(LS_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}
function saveGuests(g) { try { localStorage.setItem(LS_KEY, JSON.stringify(g)); } catch {} }
// invitation-code match: uppercase, alphanumeric only.
// NOTE: local-only — this function IS window.normCode, never delegate to it.
function normCode(s){
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function findByCode(list, code){ const n = normCode(code); return list.findIndex(x=>normCode(x.code)===n); }
function asCompanions(v){
  if(Array.isArray(v)) return v.map(c=>String(c).trim()).filter(Boolean);
  if(v == null) return [];
  return String(v).split(/[;,\n]+/).map(c=>c.trim()).filter(Boolean);
}
// local-only (see normCode note above).
function seatsUsed(g){
  if(!g) return 0;
  const s=String(g.status||"").toLowerCase();
  if(s==="declined") return 0;
  if(s==="attending"||s==="confirmed") return 1+(asCompanions(g.companions).length);
  return 0;
}

let guests = loadGuests();
let current = null;

// Guarded init: the button must work even if part of the page failed to load.
(function initGate(){
  try{
    const btn = document.getElementById("lookupBtn");
    const inp = document.getElementById("guestCode");
    if(btn) btn.addEventListener("click", lookup);
    if(inp) inp.addEventListener("keydown", e=>{ if(e.key==="Enter") lookup(); });
    window.__rsvpReady = true;
  }catch(e){ console.warn("gate init failed:", e); }
})();

async function lookup(){
  const el = document.getElementById("guestCode");
  const raw = el ? el.value : "";
  const q = normCode(raw);
  const msg = document.getElementById("nameMsg");
  if(!q){ msg.innerHTML = `<div class="error">Please enter your invitation code.</div>`; return; }

  // Live mode: query Google Sheet via GAS (source of truth when deployed)
  if(window.usingGas && window.usingGas()){
    msg.innerHTML = `<div class="notice">Finding your invitation…</div>`;
    try{
      const res = await window.gasGet({ action: "lookup", code: raw.trim() });
      if(res && res.ok && res.guest){
        // One-time codes: once status leaves "pending", the code is spent.
        if(String((res.guest.status || "pending")).toLowerCase() !== "pending"){
          msg.innerHTML = `<div class="error">This code (<b>${String(res.guest.code || raw.trim()).toUpperCase()}</b>) has already been used — RSVP is closed for it. If you need changes, please message Jess &amp; Ara.</div>`;
          return;
        }
        msg.innerHTML=""; unlock(res.guest); return;
      }
      msg.innerHTML = `<div class="error">Sorry, we can't find code "<b>${raw.trim().toUpperCase()}</b>". Check the code on your invitation, or message Jess & Ara.</div>`;
      return;
    }catch(err){
      console.warn("GAS lookup failed, falling back to local:", err);
      // fall through to local cache below
    }
  }

  guests = loadGuests();

  // exact code match only (no suggestions — codes don't enumerate names)
  const exact = guests.find(x=>normCode(x.code)===q);
  if(exact){
    // One-time codes: once status leaves "pending", the code is spent.
    if(String(exact.status || "pending").toLowerCase() !== "pending"){
      msg.innerHTML = `<div class="error">This code (<b>${String(exact.code).toUpperCase()}</b>) has already been used — RSVP is closed for it. If you need changes, please message Jess &amp; Ara.</div>`;
      return;
    }
    msg.innerHTML=""; unlock(exact); return;
  }

  msg.innerHTML = `<div class="error">Sorry, we can't find code "<b>${raw.trim().toUpperCase()}</b>". Check the code on your invitation, or message Jess & Ara.</div>`;
}

function unlock(g){
  // Normalize + prefer fresh data (GAS sheet) over stale localStorage cache.
  // CODE is the key — names can change freely.
  const fresh = {...(g||{}),
    code: String((g && g.code) || "").trim().toUpperCase(),
    name: String((g && g.name) || "").trim(),
    pax: Math.max(1, parseInt(g && g.pax, 10) || 1),
    companions: asCompanions(g && g.companions),
    contact: (g && g.contact) || "",
    message: (g && g.message) || ""};
  const i = findByCode(guests, fresh.code);
  if(window.usingGas && window.usingGas()){
    current = fresh;
    if(i>=0){ guests[i] = {...guests[i], ...fresh}; saveGuests(guests); }
  } else {
    current = i>=0 ? {...guests[i], companions: asCompanions(guests[i].companions)} : fresh;
  }
  document.getElementById("gateWrap").style.display="none";
  document.getElementById("rsvpWrap").style.display="block";
  document.getElementById("step-done").style.display="none";
  document.getElementById("step-declined").style.display="none";
  document.getElementById("step-form").style.display="block";
  document.getElementById("formMsg").innerHTML="";
  document.getElementById("guestInfo").innerHTML =
    `Hello, <b>${current.name}</b>! Reserved seats: <b>${current.pax}</b> • Table: ${current.table}` +
    (current.status!=="pending" ? ` • Current: <b>${current.status}</b>` : ``);
  document.getElementById("maxPax").textContent = current.pax;
  const sel = document.getElementById("count");
  sel.innerHTML = "";
  for(let i2=1;i2<=current.pax;i2++){ const o=document.createElement("option"); o.value=i2; o.textContent=`${i2} seat${i2>1?"s":""}`; sel.appendChild(o); }
  const used = seatsUsed(current);
  sel.value = Math.min(used > 0 ? used : current.pax, current.pax);
  renderCompanions();
  sel.onchange = renderCompanions;
  document.querySelectorAll('input[name="attend"]').forEach(r=>{
    r.onchange = ()=>{
      const isYes = document.querySelector('input[name="attend"]:checked').value==="yes";
      document.getElementById("attendFields").style.display = isYes ? "block":"none";
    };
  });
  document.querySelector('input[name="attend"][value="yes"]').checked = true;
  document.getElementById("attendFields").style.display = "block";
  document.getElementById("contact").value = current.contact||"";
  document.getElementById("message").value = current.message||"";
  window.scrollTo({top:0, behavior:"smooth"});
}
function lock(){
  current = null;
  document.getElementById("rsvpWrap").style.display="none";
  document.getElementById("gateWrap").style.display="block";
  const inp = document.getElementById("guestCode");
  if(inp) inp.value="";
  document.getElementById("nameMsg").innerHTML="";
  window.scrollTo({top:0, behavior:"smooth"});
}

function renderCompanions(){
  const sel = document.getElementById("count");
  const n = parseInt((sel && sel.value) || "1", 10);
  const box = document.getElementById("companions");
  // preserve what the user already typed when they change the dropdown
  const typed = [...box.querySelectorAll("[data-comp]")].map(i=>i.value.trim());
  const saved = asCompanions(current && current.companions);
  box.innerHTML = "";
  if(n<=1){ box.innerHTML = `<p class="muted" style="font-size:13px">Solo seat — no companions needed.</p>`; return; }
  // n seats = 1 guest + (n-1) companion inputs. Pre-fill from sheet, else keep typed.
  box.innerHTML = `<label>Companion names (${n-1} needed)</label>`;
  for(let i=0;i<n-1;i++){
    const inp = document.createElement("input");
    inp.placeholder = `Companion ${i+1} full name`;
    inp.dataset.comp = i;
    inp.style.marginBottom = "8px";
    inp.autocomplete = "off";
    inp.value = typed[i] || saved[i] || "";
    box.appendChild(inp);
  }
}

document.getElementById("backBtn").addEventListener("click", lock);

function showDone(){
  document.getElementById("step-form").style.display="none";
  document.getElementById("step-declined").style.display="none";
  document.getElementById("step-done").style.display="block";
  const used = seatsUsed(current);
  document.getElementById("doneBox").innerHTML =
    `<b>Salamat, ${current.name}!</b><br/>You confirmed <b>${used} / ${current.pax}</b> seat(s). Your code is now closed — tap below to open your invitation.<br/><span class="muted">If nothing happens, tap “Continue to Invitation”.</span>`;
  document.getElementById("formMsg").innerHTML="";
  document.getElementById("rsvp").scrollIntoView({behavior:"smooth"});
  // No auto-redirect: guest taps the Canva button above the venue details.
}
function showDeclined(){
  document.getElementById("step-form").style.display="none";
  document.getElementById("step-done").style.display="none";
  document.getElementById("step-declined").style.display="block";
  document.getElementById("declinedBox").innerHTML =
    `<b>Thank you, ${current.name}.</b><br/>You declined — your seats will be released. We'll miss you!`;
  document.getElementById("formMsg").innerHTML="";
  document.getElementById("rsvp").scrollIntoView({behavior:"smooth"});
}
document.getElementById("submitBtn").addEventListener("click", async ()=>{
  const fmsg = document.getElementById("formMsg");
  // One-time codes: never submit twice for the same code.
  if(current && String(current.status || "pending").toLowerCase() !== "pending"){
    fmsg.innerHTML = `<div class="error">This code has already been used — RSVP is closed for it. If you need changes, please message Jess &amp; Ara.</div>`;
    return;
  }
  const attend = document.querySelector('input[name="attend"]:checked').value;
  const contact = document.getElementById("contact").value.trim();
  const message = document.getElementById("message").value.trim();
  let count = parseInt(document.getElementById("count").value,10) || 1;
  let comps = [];
  if(attend==="no"){
    count = 0;
  } else {
    const compInputs = [...document.querySelectorAll("[data-comp]")];
    comps = compInputs.map(i=>i.value.trim()).filter(Boolean);
    if(comps.length !== count-1){
      fmsg.innerHTML = `<div class="error">Please name all ${count-1} companion(s) for your ${count} seats.</div>`;
      return;
    }
  }

  // Live mode: write to Google Sheet (CODE is the key)
  if(window.usingGas && window.usingGas()){
    const btn = document.getElementById("submitBtn");
    btn.disabled = true; btn.textContent = "Sending…";
    try{
      const res = await window.gasPost({
        action: "rsvp",
        code: current.code,
        name: current.name,
        status: attend === "no" ? "declined" : "attending",
        companions: comps,
        contact, message
      });
      if(!res || !res.ok) throw new Error((res && res.error) || "RSVP failed");
      current = {...current,
        status: attend === "no" ? "declined" : "attending",
        companions: attend === "no" ? [] : comps,
        contact, message};
      if(attend === "no") showDeclined(); else showDone();
    }catch(err){
      console.warn("GAS rsvp failed:", err);
      fmsg.innerHTML = `<div class="error">Couldn't send RSVP (${String(err.message||err)}). Check connection and try again.</div>`;
    }finally{
      btn.disabled = false; btn.textContent = "Submit RSVP";
    }
    return;
  }

  guests = loadGuests();
  const idx = findByCode(guests, current.code);
  if(idx<0) return;
  // One-time codes (local mode): a non-pending row is spent.
  if(String(guests[idx].status || "pending").toLowerCase() !== "pending"){
    fmsg.innerHTML = `<div class="error">This code has already been used — RSVP is closed for it. If you need changes, please message Jess &amp; Ara.</div>`;
    return;
  }
  if(attend==="no"){
    guests[idx] = {...guests[idx], status:"declined", companions:[],
      contact,
      message};
  } else {
    guests[idx] = {...guests[idx], status:"attending", companions:comps,
      contact,
      message};
  }
  saveGuests(guests);
  current = guests[idx];
  if(attend === "no") showDeclined(); else showDone();
});
document.getElementById("againBtn").addEventListener("click", lock);
