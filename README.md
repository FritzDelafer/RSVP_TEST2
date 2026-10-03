# Jess & Ara Wedding — RSVP v2 (gate + form → Canva) • 12.19.2026

Lean RSVP front-end. Flow: envelope welcome → **invitation-code gate** → **RSVP form**.

- **Accepts** → RSVP saved to the Google Sheet → auto-redirect to the Canva invitation site (`https://jebscer16.my.canva.site/jess-ara-wedding/`)
- **Declines** → thank-you message + gift guide on the page (no redirect)

## Pages
- `index.html` — envelope → code gate → RSVP form → Canva handoff
- `admin.html` — guest list dashboard (password `12192026`): search/filter, headcount, **add/edit/delete** (code generator included)
- `apps-script/Code.gs` — Google Sheets backend (tab `GuestList`, **same sheet as v1**). Already deployed — same `window.GAS_URL` in `data.js`. Only re-paste if the backend file changes.

## Guest list format
Sheet tab `GuestList`: `CODE | NAME | PAX | SIDE | TABLE | STATUS | COMPANIONS | CONTACT | MESSAGE`
- CODE is the key (unique). COMPANIONS joined with `"; "`.

## Run locally
```powershell
cd "C:\Users\johnf\Documents\wedding-rsvp-v2"
npx serve .
# or
python -m http.server 3000
```
Open http://localhost:3000 — try code `MPC27B5` (any casing).

## Deploy to Vercel
1. vercel.com → Add New Project → Import `RSVP_TEST2`
2. Framework: Other, no build command → Deploy
