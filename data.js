// Guest list — keyed by CODE (invitation code). Case-insensitive, spaces ignored.
// Mirrors Google Sheet tab "GuestList": CODE | NAME | PAX | SIDE | TABLE | STATUS | COMPANIONS | CONTACT | MESSAGE
// Code scheme: INITIALS + PAX + 3 random chars (e.g. CF4K7P). Guests type the code to unlock.
// Seats used = 1 + companions.length when Attending, 0 when Declined.
window.GAS_URL = "https://script.google.com/macros/s/AKfycbzqwmcSZ1AspOcdxFRMsNK8bPhn9Jl6Q42k0lyqU2KYnACjbvkYbZzx92fFtzrkVZOI/exec";
window.SHEET_TAB = "GuestList";
window.GAS_KEY = ""; // must match ADMIN_KEY in Code.gs (empty = no key needed)

// Shared GAS helpers (used by app.js + admin.js). GET via fetch, POST as
// text/plain to avoid CORS preflight on Apps Script web apps.
// Timeouts included: a hanging request must never freeze the UI.
function gasTimeout_(ms){
  try{
    if(window.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
  }catch(e){}
  return undefined;
}
window.gasGet = async function (params) {
  const qs = new URLSearchParams(params || {}).toString();
  const res = await fetch(window.GAS_URL + (qs ? "?" + qs : ""), { cache: "no-store", signal: gasTimeout_(15000) });
  if (!res.ok) throw new Error("GAS GET failed: " + res.status);
  return res.json();
};
window.gasPost = async function (body) {
  const payload = Object.assign({}, body || {});
  if (window.GAS_KEY) payload.key = window.GAS_KEY;
  const res = await fetch(window.GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    signal: gasTimeout_(20000),
  });
  if (!res.ok) throw new Error("GAS POST failed: " + res.status);
  return res.json();
};
window.usingGas = function () { return !!(window.GAS_URL && window.GAS_URL.indexOf("/exec") > 0); };

// Normalize invitation codes: uppercase, alphanumeric only (CF4K7P == cf4 k7p)
window.normCode = function (s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
};

// Auto-generate a code: INITIALS (up to 3 letters) + PAX + 3 random chars.
// e.g. "Canto Family", 4 -> "CF4K7P". Unambiguous alphabet (no 0/O, 1/I/L).
window.makeCode = function (name, pax) {
  const words = String(name || "").split(/[\s._-]+/).filter(Boolean).slice(0, 4);
  let initials = words.map(w => (w[0] || "").toUpperCase()).join("").replace(/[^A-Z]/g, "");
  if (!initials) initials = "GUEST";
  initials = initials.slice(0, 3);
  const n = Math.max(1, parseInt(pax, 10) || 1);
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let rand = "";
  if ((window.crypto || {}).getRandomValues) {
    const buf = new Uint32Array(3);
    window.crypto.getRandomValues(buf);
    for (let i = 0; i < 3; i++) rand += abc[buf[i] % abc.length];
  } else {
    for (let i = 0; i < 3; i++) rand += abc[Math.floor(Math.random() * abc.length)];
  }
  return initials + n + rand;
};

window.SEED_GUESTS = [
  { code: "CF4K7P", name: "Canto Family", pax: 4, side: "Groom", table: "Table 1", status: "pending", companions: [], contact: "", message: "" },
  { code: "AF4M3Q", name: "Adra Family", pax: 4, side: "Bride", table: "Table 2", status: "pending", companions: [], contact: "", message: "" },
  { code: "JO1T8R", name: "Jaira Ondoy", pax: 1, side: "Bride", table: "Table 3", status: "pending", companions: [], contact: "", message: "" },
  { code: "SPC2X4D", name: "Samuel Paul Canto", pax: 2, side: "Groom", table: "Table 4", status: "pending", companions: [], contact: "", message: "" },
  { code: "MPC2J9F", name: "Ma. Pauline Canto", pax: 2, side: "Bride", table: "Table 1", status: "attending", companions: ["John Fritz Delafer"], contact: "9123123123", message: "yeahhh" },
  { code: "JA1Q2W", name: "Joshua Arquiza", pax: 1, side: "Groom", table: "Table 5", status: "declined", companions: [], contact: "", message: "Sorry, can't make it!" },
  { code: "IF3H6N", name: "Ibeas Family", pax: 3, side: "Both", table: "Table 6", status: "pending", companions: [], contact: "", message: "" },
  { code: "HCH2B5V", name: "Hannah Claire Hicks", pax: 2, side: "Both", table: "Table 7", status: "pending", companions: [], contact: "", message: "" }
];
// Seats used helper: shared by guest + admin views
window.seatsUsed = function (g) {
  if (!g) return 0;
  const s = String(g.status || "").toLowerCase();
  if (s === "declined") return 0;
  if (s === "attending" || s === "confirmed") {
    const comps = Array.isArray(g.companions)
      ? g.companions
      : String(g.companions || "").split(/[;,\n]+/).map(c => c.trim()).filter(Boolean);
    return 1 + comps.length;
  }
  return 0;
};
