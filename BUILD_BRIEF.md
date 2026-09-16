# BUILD BRIEF — AIA Class 10-A Hub (Premium Rebuild)

You are building a complete, professional multi-page class portal website. Read this brief fully before starting. Also read `data/seed-data.json` in this same folder — that is the ONLY content source. Do NOT invent any new students, teachers, homework, announcements, polls, or scores.

## Mission
Rebuild the concept + data of the original "AIA Class 10-A Hub" (a school class website) as a BRAND-NEW, world-class, premium website. **Zero design similarity to the original** (which was a plain white card-based single page). This must look like a multi-billion-dollar company product — think Linear / Stripe / Vercel / Apple-level polish, but themed as a school class hub.

## Hard technical constraints (non-negotiable)
1. Build everything INSIDE `/mnt/d/AIA-Class10A-Hub/` (Windows D:\AIA-Class10A-Hub).
2. **PURE static site**: plain HTML + CSS + vanilla JS. NO build step, NO npm, NO node_modules, NO frameworks, NO server. Must work by double-clicking `index.html` (file:// protocol) in any modern browser.
3. **No fetch() of local files** (file:// blocks it). All seed data must be embedded as a JS file loaded via `<script src="data/seed.js">` (convert the JSON to a JS object: `window.SEED = {...}`). Do this conversion yourself.
4. All dynamic state (admin edits, comments, poll votes, chat history, vote flags, pass unlock) persists in **localStorage**. Data must seed from `SEED` on first run (localStorage empty), then read/write localStorage.
5. All CSS/JS files live in `css/` and `js/` folders. No inline page-specific CSS blobs — one shared `css/style.css` + optional per-page extras, one shared `js/main.js` + `js/data.js` (storage layer) + per-page logic files as needed. Shared navbar + footer on every page (duplicated markup is fine).
6. Internet may be available, but **do NOT hard-depend on CDNs** — every core animation/effect must be hand-written CSS/JS that works fully offline. Google Fonts / Font Awesome CDN may be referenced as progressive enhancement with graceful fallbacks.
7. Files on disk: `index.html`, `students.html`, `teachers.html`, `homework.html`, `scores.html`, `announcements.html`, `polls.html`, `ai.html`, `admin.html`, `css/`, `js/`, `data/seed.js`, plus `README.md`.

## Page inventory (multi-page site)
1. **index.html** — Landing: animated hero, live class stats (33 students, 6 teachers, counts from data), feature cards for every section, notice of latest announcement, scroll-reveal animations.
2. **students.html** — Searchable animated grid of all 33 students (alphabetical, numbered). Click a student → premium modal/drawer with their profile (bio, strengths, interests, goals; graceful "Profile not set yet" state for students without data). NITIN gets an ADMIN badge. Section 10-B info card.
3. **teachers.html** — Premium teacher directory (6 teachers) + School Leadership (Director Rekha Kataria, Principal Saroj Ma'am). Cards with subject, name, detail.
4. **homework.html** — Homework list (subject, task, due badge). Comment threads on each homework item (student name dropdown + comment, stored in localStorage).
5. **scores.html** — Test scores table (student, subject, test name, score/max, date) with animated bars/percentages. Include the seed score (NITIN MATHS 49/50).
6. **announcements.html** — Announcement cards (title, body, date) + comment threads. Include the ANNUAL FUNCTION announcement.
7. **polls.html** — Poll cards with vote buttons + live animated result bars (percentages + vote counts, stored in localStorage). Include the favourite-teacher poll with its 4 options. One vote per option per browser (flag in localStorage).
8. **ai.html** — Class AI chat: Study Bot / Homework Bot / Quiz Bot modes (switcher chips). Typing indicator, message bubbles, markdown-lite rendering (bold, lists, headings), suggested-question chips. **The AI is a smart local rule-based engine in vanilla JS** (no API): it answers from the class knowledge base (students/profiles, teachers, homework, announcements, scores, polls) with keyword matching + helpful canned responses, plus Quiz Bot mode that asks MCQs from the knowledge base like photosynthesis/homework/science topics and grades answers. Chat history persisted in localStorage. Clear-chat button.
9. **admin.html** — Admin panel (protected by the access pass  stored in session/localStorage): dashboard stat cards (homework count, test score count, announcements count, student profiles count, polls count), and CRUD tabs: add/delete Homework, add/delete Test Scores, post/delete Announcements, create/delete Polls, edit Student Profiles (bio/strengths/interests/goals picker per student). All writes go to localStorage. Every add shows a toast; destructive deletes need confirm(). A "Reset all data to seed" button in a settings area. Back-to-site link.
10. A universal **login gate** for the class site: visitor must enter the access pass  (hardcode it) before pages work — store `aia_unlocked=true` in localStorage. Gate must be gorgeous (glass card, animated). If locked, redirect any page to `index.html` which shows the gate; after unlock, show the site. Keep it simple: all public pages check the flag and show a full-screen premium lock overlay if not unlocked.

## Premium design system (the most important part)
- **Aesthetic**: deep-space dark navy/black background with a refined gold/amber + electric blue/violet accent system. Glassmorphism cards (translucent, blur, subtle borders). Soft layered glows. No flat bootstrap vibes anywhere.
- **Typography**: big confident display headings (clamp() responsive), tight letter-spacing, elegant body font stack.
- **Animations (all hand-written, offline-safe)**:
  - Scroll-reveal: elements fade/slide up staggered via IntersectionObserver; CSS classes `.reveal`, `.reveal-visible`.
  - Animated canvas particle/stars background on hero (lightweight, requestAnimationFrame, respects reduced-motion).
  - Live animated counters (students count, teachers count, etc.) counting up on scroll into view.
  - Smooth scrolling (CSS `scroll-behavior` + a lightweight custom smooth-scroll for anchors).
  - Magnetic buttons + hover glow/tilt on cards (transform + transition, subtle 3D tilt on mouse move for feature cards).
  - Page-load intro: hero content staggers in; navbar slides down.
  - Marquee strip (announcement ticker) on home.
  - Gradient aurora blob background (animated blurred radial gradients) behind hero.
  - Typing indicator dots in chat; message pop-in.
  - Poll bars animate width on load/vote.
  - Back-to-top button; sticky glass navbar with active-link glow.
  - Micro-interactions everywhere: buttons scale on press, cards lift with glow on hover.
  - `prefers-reduced-motion` media query disables heavy animation.
- **Responsive**: flawless from 360px phones to 4K. Navbar collapses to a hamburger drawer on mobile.
- Favicon: create an inline SVG favicon (🎓 or graduation-cap glyph on gradient) at `favicon.svg`.

## New features beyond the original (add all)
- Live date/clock chip in navbar (IST).
- Homework due-countdown badges ("Due in 3 days" / "Overdue").
- Score analytics: per-student average + subject stats on scores page from available data.
- Poll "live" pulse dot + total-votes counter.
- Announcement "NEW" badges for items < 3 days old.
- Student search with highlight matching.
- Keyboard shortcut: `/` focuses search on students page.
- Confetti burst (tiny canvas-free CSS/JS) when a vote is cast.
- Toast notification system (top-right, animated).
- Print-friendly stylesheet for scores page (print report).
- Empty states that look designed (illustration via emoji + message).
- Footer: school name, class, admin credit, "Built with ❤ for Class 10-A" line, back-to-top.

## Quality bar
- Zero console errors. Clean, commented, consistent code.
- Every link/button works. Every page tested logically for file:// operation.
- The site must feel ALIVE — smooth, cinematic, premium — but never laggy (keep particle counts and blur usage reasonable).
- Write a short `README.md` describing the site, the access pass, admin capabilities, and how to open it.

## Before finishing
- Verify the file tree matches the spec, seed data is present in `data/seed.js`, and index.html exists.
- Report back: list of files created, what was built, and any deviations.