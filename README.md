# 🎓 AIA Class 10-A Hub

The premium digital home for **Alpha International Academy — Class 10-A**.
Multi-page static site (HTML + CSS + vanilla JS, no build step) with Apple-grade
dark glass design, 8 themes, live group chat, polls, AI study bot — and
**serverless sync**: every tab and every phone stays in sync with no server.

## 🚀 How to open

Just double-click **`index.html`** — works fully offline in any modern browser
(no server needed). Also deployable anywhere static (`Render`, `GitHub Pages`,
`Netlify`) or via the optional tiny Node hub (`npm start` → `server.js`).

**Access:** student username/password login, or the visitor pass. Admin accounts:
`admin_vinay` / `admin_nitin` (owner panel in `admin.html`).

## 📄 Pages

| Page | What's inside |
|---|---|
| `index.html` | Cinematic hero, live stats, feature cards, news spotlight |
| `students.html` | All 33 students, searchable grid, profile modal |
| `teachers.html` | 6 teachers + school leadership |
| `subjects.html` | 6 subjects: notes, homework links, photos + lightbox |
| `chat.html` | **Live group chat** — everyone sees everyone, typing dots |
| `homework.html` | Tracker with due-countdown badges + comment threads |
| `scores.html` | Test scores, animated % bars, analytics (printable) |
| `announcements.html` | News cards + comment threads, NEW badges |
| `polls.html` | Live polls, one vote per student, confetti on vote |
| `ai.html` | Class AI — Study / Homework / Quiz bots (local + API brain) |
| `admin.html` | Owner panel: content, users, photos, AI config, sync, themes |

## ⇄ Sync — WITHOUT any server

Open the **Sync Center** (⟳ button, bottom-left, on every page):

- **Same phone, all tabs** — syncs instantly & automatically.
- **Other phones / PCs** — three server-free ways:
  1. **Sync code** — copy on one device, paste → Merge on the other.
  2. **Sync file** — download `.json`, send it (WhatsApp etc.), import it.
  3. **LIVE P2P link** — WebRTC data-channel with copy/paste codes. Stays
     live while both pages are open. No accounts, no server (a public STUN
     entry only helps NAT; same-WiFi works peer-to-peer).

What syncs: class chat, comments, polls + votes, homework, announcements,
scores, profiles, subject notes + photos, theme, AI config, presence.
Merging is **additive & safe** — syncing never deletes anything on your device.
(Admin deletes are local-only by design.)

Deployed with `server.js`? It acts as an extra merge hub (merge, never
overwrite). The site never *needs* it.

## 🧍 Mascots — Vinay & Nitin (classic stickmen)

Two **classic thin-line stickmen** living at the bottom of every page, animated
by a procedural rig (IK limbs, springy head, squash & stretch):

- **VINAY** 💜 — violet, sporty headband, the cool one
- **NITIN** 💚 — teal, glasses + tie, the classy admin one

They breathe, blink, watch your cursor, wander, wave, dance, yawn, high-five —
**click them, double-click for a dance, or GRAB & THROW them** (mouse + touch).
They celebrate your votes and chat messages. Hide/show via the ◠‿◠ button.

## 📱 Smartphone ready

Bottom tabbar with safe-area insets, 44px+ touch targets, bottom-sheet modals,
sticky chat input, 16px inputs (no iOS zoom), compressed photo uploads,
battery-friendly canvases (pause off-screen), works 360px → 4K.

## ✨ Effects

Scroll-progress bar, page transitions, staggered reveals, spotlight cards,
constellation particles, aurora blobs, physics confetti, marquee ticker,
magnetic buttons, 3D tilt, toasts, typing indicators — all hand-written,
all `prefers-reduced-motion` safe.

## 🛠 Tech

- 100% static: HTML + CSS + vanilla JS. Data seeded from `seed.js` → localStorage
- `data.js` storage layer (stable IDs, quota-safe writes), `sync-bridge.js`
  serverless sync engine, `stickmen.js` procedural animation engine
- Optional `server.js` merge hub for deploys (`npm start`)

## 🔄 Reset

Admin panel → Settings → "Reset All Data to Seed" (local device only).

---
© 2026 AIA Class 10-A Hub. Built with ❤ for Class 10-A by **Vinay & Nitin 👌**
