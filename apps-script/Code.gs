/**
 * Jess & Ara Wedding RSVP — Google Sheets backend (CODE entry).
 *
 * SETUP (one time, or when upgrading from name-entry):
 * 1. Open your spreadsheet → Extensions → Apps Script.
 * 2. Delete everything in Code.gs → paste this whole file → Save (Ctrl+S).
 * 3. In the SHEET tab "GuestList": make sure row 1 has a CODE column.
 *    Easiest: insert a new column A, put "CODE" in A1, and fill one code
 *    per guest (e.g. CF4K7P). Canonical order:
 *    CODE | NAME | PAX | SIDE | TABLE | STATUS | COMPANIONS | CONTACT | MESSAGE
 *    (Column order is flexible — the script maps by header name. Codes are
 *    matched case-insensitively, spaces ignored.)
 * 4. Pick function "setup" → Run once → authorize. This adds any missing
 *    headers without touching your data.
 * 5. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)
 *    → copy URL ending in /exec → paste as window.GAS_URL in data.js.
 *    (Redeploy → New version after every Code.gs change.)
 *
 * Sheet tab: "GuestList"
 * Columns (9): CODE | NAME | SIDE... (see HEADERS below)
 * - CODE is the key. Lookup is code-only (no name suggestions — names can't
 *   be enumerated). STATUS accepts Attending/Confirmed/Yes (=attending),
 *   Declined/No (=declined), anything else (=pending). Stored as Attending/Declined/Pending.
 * - COMPANIONS: one or more names joined with "; " (e.g. "Juan; Maria").
 * - Seats used = 1 + companions count when Attending, 0 when Declined.
 * - If ADMIN_KEY below is set, list/upsert/delete require ?key= or body.key to match.
 */

const TAB_NAME = "GuestList";
const HEADERS = ["CODE","NAME","PAX","SIDE","TABLE","STATUS","COMPANIONS","CONTACT","MESSAGE"];
const ADMIN_KEY = ""; // optional: set e.g. "ja-secret-2026", then admin calls must send it

function norm_(s){ return String(s == null ? "" : s).toLowerCase().trim().replace(/\s+/g, " "); }
function normCode_(s){ return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normHeader_(s){ return norm_(s).toUpperCase().replace(/[^A-Z]/g, ""); }

function sheet_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB_NAME);
  if(!sh) sh = ss.insertSheet(TAB_NAME);
  return sh;
}

function colMap_(sh){
  const lastCol = Math.max(sh.getLastColumn(), HEADERS.length);
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(normHeader_);
  const map = {};
  HEADERS.forEach(h => { map[h] = head.indexOf(h); });
  // add any missing headers at the end (once — normalized compare fixes repeat-add bug)
  let col = sh.getLastColumn();
  HEADERS.forEach(h => {
    if(map[h] < 0){ col++; sh.getRange(1, col).setValue(h); map[h] = col - 1; }
  });
  return map;
}

function parseCompanions_(v){
  if(Array.isArray(v)) return v.map(c=>String(c).trim()).filter(Boolean);
  return String(v == null ? "" : v).split(/[;,\n]+/).map(c => c.trim()).filter(Boolean);
}
function joinCompanions_(arr){
  return (arr || []).map(c=>String(c).trim()).filter(Boolean).join("; ");
}

function readStatus_(s){
  const n = norm_(s);
  if(n === "attending" || n === "confirmed" || n === "confirm" || n === "yes" || n === "attends") return "attending";
  if(n === "declined" || n === "decline" || n === "no") return "declined";
  return "pending";
}
function writeStatus_(s){
  const n = readStatus_(s);
  if(n === "attending") return "Attending";
  if(n === "declined") return "Declined";
  return "Pending";
}

function rowToGuest_(map, vals){
  const at = h => (map[h] >= 0 ? vals[map[h]] : "");
  return {
    code: String(at("CODE") || "").trim().toUpperCase(),
    name: String(at("NAME") || "").trim(),
    pax: Math.max(1, parseInt(at("PAX"), 10) || 1),
    side: String(at("SIDE") || "").trim() || "Both",
    table: String(at("TABLE") || "").trim(),
    status: readStatus_(at("STATUS")),
    companions: parseCompanions_(at("COMPANIONS")),
    contact: String(at("CONTACT") || "").trim(),
    message: String(at("MESSAGE") || "").trim()
  };
}

function listGuests_(){
  const sh = sheet_();
  const map = colMap_(sh);
  const lastRow = sh.getLastRow();
  if(lastRow < 2) return [];
  const width = Math.max(sh.getLastColumn(), HEADERS.length);
  const vals = sh.getRange(2, 1, lastRow - 1, width).getDisplayValues();
  return vals.map(v => rowToGuest_(map, v)).filter(g => g.code !== "" && g.name !== "");
}

function findRow_(sh, map, code){
  const n = normCode_(code);
  if(!n || map.CODE < 0) return -1;
  const lastRow = sh.getLastRow();
  if(lastRow < 2) return -1;
  const codes = sh.getRange(2, map.CODE + 1, lastRow - 1, 1).getDisplayValues().flat();
  for(let i = 0; i < codes.length; i++){
    if(normCode_(codes[i]) === n) return i + 2; // 1-indexed row
  }
  return -1;
}

function findRowByName_(sh, map, name){
  const n = norm_(name);
  if(!n || map.NAME < 0) return -1;
  const lastRow = sh.getLastRow();
  if(lastRow < 2) return -1;
  const names = sh.getRange(2, map.NAME + 1, lastRow - 1, 1).getDisplayValues().flat();
  for(let i = 0; i < names.length; i++){
    if(norm_(names[i]) === n) return i + 2;
  }
  return -1;
}

function setCell_(sh, r, map, header, value){
  if(map[header] < 0) return;
  sh.getRange(r, map[header] + 1).setValue(value);
}

function out_(obj, callback){
  let t;
  if(callback){
    t = ContentService.createTextOutput(callback + "(" + JSON.stringify(obj) + ");");
    t.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    t = ContentService.createTextOutput(JSON.stringify(obj));
    t.setMimeType(ContentService.MimeType.JSON);
  }
  return t;
}

function checkAdmin_(key){
  if(!ADMIN_KEY) return true;
  return key === ADMIN_KEY;
}

// Run once from the editor: adds any missing headers (e.g. CODE) without touching data.
function setup(){
  const sh = sheet_();
  colMap_(sh);
}

// Code-only lookup: exact match, no suggestions (codes must not enumerate names).
function lookupByCode_(code){
  const q = normCode_(code);
  if(!q) return null;
  const all = listGuests_();
  return all.find(g => normCode_(g.code) === q) || null;
}

function doGet(e){
  try{
    const p = (e && e.parameter) || {};
    const cb = p.callback || p.jsonp || null;
    if(p.action === "lookup" && (p.code || p.name)){
      // Preferred: code lookup (exact only — never list similar codes/names)
      if(p.code){
        const hit = lookupByCode_(p.code);
        if(hit) return out_({ ok:true, guest:hit }, cb);
        return out_({ ok:false, error:"not found" }, cb);
      }
      // Legacy fallback while old clients still send names (remove once migrated)
      const q = norm_(p.name);
      const all = listGuests_();
      const exact = all.find(g => norm_(g.name) === q);
      if(exact) return out_({ ok:true, match:"exact", guest:exact }, cb);
      const close = all.filter(g => {
        const n = norm_(g.name);
        return q.length >= 3 && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0);
      }).slice(0, 5);
      return out_({ ok:true, match: close.length ? "close" : "none", guests:close }, cb);
    }
    if(p.action === "list"){
      if(!checkAdmin_(p.key)) return out_({ ok:false, error:"bad key" }, cb);
      return out_({ ok:true, guests:listGuests_() }, cb);
    }
    return out_({ ok:false, error:"unknown action. Use action=list|lookup" }, cb);
  } catch(err){
    return out_({ ok:false, error:String(err) }, (e && e.parameter && (e.parameter.callback || e.parameter.jsonp)) || null);
  }
}

function doPost(e){
  const lock = LockService.getScriptLock();
  try{ lock.waitLock(15000); } catch(_){}
  try{
    let body = {};
    try{ body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch(_){}
    const action = body.action || ((e && e.parameter && e.parameter.action) || "");

    if(action === "rsvp"){
      const sh = sheet_();
      const map = colMap_(sh);
      // CODE is the key; fall back to name only for legacy clients
      let r = body.code ? findRow_(sh, map, body.code) : -1;
      if(r < 0 && body.name) r = findRowByName_(sh, map, body.name);
      if(r < 0) return out_({ ok:false, error:"code not on list" });
      const st = readStatus_(body.status);
      if(st === "declined"){
        setCell_(sh, r, map, "STATUS", "Declined");
        setCell_(sh, r, map, "COMPANIONS", "");
      } else if(st === "attending"){
        const comps = parseCompanions_(body.companions);
        setCell_(sh, r, map, "STATUS", "Attending");
        setCell_(sh, r, map, "COMPANIONS", joinCompanions_(comps));
      } else {
        setCell_(sh, r, map, "STATUS", "Pending");
        setCell_(sh, r, map, "COMPANIONS", joinCompanions_(parseCompanions_(body.companions)));
      }
      setCell_(sh, r, map, "CONTACT", String(body.contact || "").trim());
      setCell_(sh, r, map, "MESSAGE", String(body.message || "").trim());
      SpreadsheetApp.flush();
      return out_({ ok:true });
    }

    if(action === "upsert" || action === "delete"){
      if(!checkAdmin_(body.key)) return out_({ ok:false, error:"bad key" });
      const sh = sheet_();
      const map = colMap_(sh);
      const code = (body.guest && body.guest.code) || body.code || "";
      const r = findRow_(sh, map, code);
      if(action === "delete"){
        if(r > 0) sh.deleteRow(r);
        else if(body.name || (body.guest && body.guest.name)){
          const rn = findRowByName_(sh, map, body.name || body.guest.name);
          if(rn > 0) sh.deleteRow(rn);
        }
        SpreadsheetApp.flush();
        return out_({ ok:true });
      }
      const g = body.guest || {};
      const vals = {
        CODE: String(g.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
        NAME: String(g.name || "").trim(),
        PAX: Math.max(1, parseInt(g.pax, 10) || 1),
        SIDE: String(g.side || "Both"),
        TABLE: String(g.table || ""),
        STATUS: writeStatus_(g.status),
        COMPANIONS: joinCompanions_(parseCompanions_(g.companions)),
        CONTACT: String(g.contact || ""),
        MESSAGE: String(g.message || "")
      };
      if(!vals.CODE) return out_({ ok:false, error:"code required" });
      if(!vals.NAME) return out_({ ok:false, error:"name required" });
      if(r > 0){
        // write per-column by name — safe even if sheet order differs
        HEADERS.forEach(h => setCell_(sh, r, map, h, vals[h]));
      } else {
        // append in canonical order
        sh.appendRow(HEADERS.map(h => vals[h]));
      }
      SpreadsheetApp.flush();
      return out_({ ok:true });
    }

    return out_({ ok:false, error:"unknown action. Use action=rsvp|upsert|delete" });
  } catch(err){
    return out_({ ok:false, error:String(err) });
  } finally {
    try{ lock.releaseLock(); } catch(_){}
  }
}
