# BUILD BRIEF V2 — AIA Class 10-A Hub (ULTRA UPGRADE)

You are performing a massive upgrade to an existing multi-page class portal website at `/mnt/d/AIA-Class10A-Hub/`. Read this entire brief before starting. Read ALL existing files in the project first to understand the current codebase.

## CRITICAL CONSTRAINTS
1. **PURE static site**: plain HTML + CSS + vanilla JS. NO build step, NO npm, NO node_modules, NO frameworks, NO server. Must work by double-clicking `index.html` (file:// protocol).
2. **No fetch() of local files**. All data must be embedded or use localStorage.
3. Build everything INSIDE `/mnt/d/AIA-Class10A-Hub/`.
4. All existing pages must continue working. Fix any bugs where data doesn't appear.
5. The site must be FULLY mobile responsive (360px to 4K).
6. Internet CDN dependencies (Google Fonts, Font Awesome) are OK as progressive enhancement.

## FEATURE LIST — Implement ALL of these:

### 1. STICK MEN VINAY & NITIN (Replace existing cartoonish SVGs)
- Replace the current cartoonish SVG mascots with simple **stick figure** characters drawn with SVG or CSS.
- Each stick man should be ~80px tall, drawn as lines (circle head, line body, line arms, line legs).
- They should be LIVELY — perform random actions every few seconds:
  - **Dancing** (wiggling arms/legs with CSS animation)
  - **Jumping** (bouncing up and down)
  - **Climbing** (crawling up the side of the layout/navbar)
  - **Waving** (arm wave animation)
  - **High-fiving** each other (both walk to center, arms up, slap)
  - **Running** across the bottom of the screen
  - **Sitting and thinking** (scratching head)
  - **Celebrating** (arms up, jumping)
- They should INTERACT with each other:
  - Walk toward each other → high-five → walk back
  - One pushes the other off screen → other runs back
  - They have speech bubbles with random funny school quotes
- **Vinay** = slightly cooler stick figure (maybe a tiny sunglasses line on head), says fun/confident things.
- **Nitin** = stick figure with a tiny rectangle (glasses) on head, says admin/organized things.
- They should react to user scrolling (wave when user scrolls to bottom, etc.)
- Keep the stage fixed at bottom of every page, but make it collapsible on mobile (tap to toggle).
- When one user interacts, show brief animations. Add click handlers — click Vinay → he does a trick; click Nitin → he shows a random fact.

### 2. STUDENT CHAT SECTION (NEW PAGE: chat.html)
- Add a new page `chat.html` — a real-time-style student chat room.
- **Login flow**: Every student must log in with a username and password before chatting.
- **Credentials**: For each of the 33 students in seed-data.json, generate a username and password:
  - Username = first 3 letters of name + random 3 digits (e.g., "VIN123", "NIT456")
  - Password = random 6-character string with letters + numbers (e.g., "aB3x9K")
  - Store these in `data/seed.js` under `window.SEED.credentials` as an array of `{name, username, password}` objects.
  - Admin (VINAY KHILERI) gets special credentials: username "admin_vinay", password "Vinay@Admin1"
  - Nitin also gets admin-level: username "admin_nitin", password "Nitin@Admin2"
- **Chat UI**:
  - After login, show the chat room with messages.
  - Messages show ONLY the student's real name (not username) as the sender.
  - Each message has: sender name, message text, timestamp.
  - Typing indicator when someone is "typing" (simulate briefly).
  - Auto-scroll to newest messages.
  - Message input with send button.
- **Privacy**: Each user's chat history is stored per-user in localStorage (keyed by their username). One user's chat should NOT appear to another user's chat view. Admin users (Vinay/Nitin) can see ALL messages from ALL users in a special "Admin View" toggle.
- **Clear History**: Each user has a "Clear My History" button that removes their own messages.
- **Persistence**: Messages stored in localStorage under `aia_chat_<username>`.
- Add `chat.html` to the navbar and homepage quick links.
- The chat page should have the same premium dark theme as the rest of the site.

### 3. SUBJECT HOMEWORK SECTION (NEW PAGE: subjects.html)
- Add a new page `subjects.html` dedicated to subject-wise homework and resources.
- **6 Subjects**: Maths, Science, English, Hindi, SST, Sanskrit.
- Each subject has its own card/section showing:
  - Subject name + teacher name (from seed data)
  - Homework items for that subject (filtered from homework data)
  - Subject notes/info text (editable by admin)
  - **Photo upload area**: Admin can add photos for each subject (stored as base64 data URLs in localStorage, or as URLs).
  - AI study resources for that subject.
- **Admin can manage**: Add/edit notes per subject, upload photos per subject, add subject-specific resources.
- **AI Integration**: The Class AI should be able to answer questions about subject content. Store subject notes/resources in localStorage and make them accessible to the AI engine.
- Add `subjects.html` to navbar and homepage quick links.
- Visually: each subject should have a unique color theme/accent (e.g., Maths = blue, Science = green, English = gold, etc.).

### 4. FANTASTIC LANDING PAGE with LOGIN
- The FIRST thing a visitor sees should be a stunning animated login/landing page.
- **Before the class access pass gate**: Show a full-screen animated landing with:
  - Particle/star background (canvas or CSS)
  - Large animated school name "ALPHA INTERNATIONAL ACADEMY"
  - "CLASS 10-A HUB" subtitle with typing animation
  - Floating glassmorphism login card
  - Username/password inputs (for student chat login, OR class access pass)
  - Actually: TWO login modes:
    1. **Student Login** (default): username + password → goes to chat and full site access
    2. **Visitor Pass**: simple passcode  → full site access without chat identity
  - Smooth animations: card slides in, text fades up, particles float
  - Mobile-optimized: card stacks vertically on small screens
- After login, show a brief "Welcome, [Name]!" toast animation before entering the site.

### 5. DUAL ADMIN PASSES
- **Admin Pass 1**:  — gives basic site unlock (existing behavior).
- **Admin Pass 2**: `Admin@AIA2026` — gives FULL admin panel access with advanced features.
- The admin login page should accept either pass:
  -  → Basic view (can see everything but limited admin functions)
  - `Admin@AIA2026` → Full admin (CRUD + analytics + AI config + user tracking)
- Store admin auth level in localStorage.

### 6. ADVANCED ADMIN PANEL (Upgrade admin.html)
- **Dashboard Analytics**:
  - Total users who have visited the site (count, stored in localStorage)
  - Each user's visit log: username, last visit time, pages visited (track page views)
  - "Who is online now" indicator (use localStorage timestamps — if last activity < 2 minutes, consider online)
  - Total messages sent (chat stats)
  - Total homework items, scores, announcements, polls (existing)
  - User engagement chart (simple bar chart showing visits per student)
- **Activity Tracker**: 
  - On every page load, record `{username, page, timestamp}` in localStorage under `aia_activity_log[]`.
  - Admin panel shows a live feed of recent activities.
  - Admin can filter by student or page.
- **AI Configuration Panel**:
  - Admin can enter an **API key** for an AI service (OpenAI-compatible API).
  - Admin can set a **system prompt** for the AI bot (customizable instructions).
  - Admin can choose between:
    1. Local rule-based AI (existing, no API needed)
    2. External API AI (uses the API key + system prompt)
  - Store API key and system prompt in localStorage (note: for a real deployment, this should be server-side, but since we're static, localStorage is the only option — add a warning note in the UI).
  - The AI chat page should respect these settings.
- **User Management**:
  - List all students with their last login time, pages visited count, messages sent count.
  - Admin can reset any student's password.
  - Admin can see chat history of any student (admin view).
- **Subject Management**: Admin can manage subject notes, photos, and resources for each of the 6 subjects.

### 7. AI BOT UPGRADE (ai.html)
- **Dual Mode**:
  1. **Local Mode** (existing): Rule-based engine that answers from class knowledge base.
  2. **API Mode** (NEW): If admin has configured an API key, send questions to the API endpoint with the configured system prompt. Use `fetch()` to call the OpenAI-compatible API.
- **Per-user isolation**: Each user's AI chat history is stored separately (keyed by username). Admin can see all.
- **Clear History**: Per-user clear button.
- **Subject awareness**: AI should have access to subject notes/resources from the subjects section.
- **Better responses**: Improve the local rule engine with more keywords and better matching.

### 8. UNIQUE LAYOUT & THEME UPGRADE
- **NOT a standard layout**: Break away from the typical navbar-content-footer pattern.
- Ideas for unique layout:
  - **Diagonal/angular section dividers** (SVG clip-paths between sections)
  - **Asymmetric grids** (masonry-style for cards, not uniform rows)
  - **Floating navigation** (radial/dock-style nav on desktop, bottom tab bar on mobile like a native app)
  - **Parallax depth layers** on the homepage
  - **Color-shifting background** that subtly changes based on scroll position
  - **Custom cursor** on desktop (dot + circle follower)
  - **Page transitions** (fade/slide between pages, simulated with CSS)
- **Theme**: Deep navy/space dark theme (keep existing) but add:
  - More gradient variety per section
  - Glassmorphism refinement (better blur, subtle noise texture)
  - Accent color coding per section (students=blue, teachers=gold, homework=green, scores=violet, chat=teal, subjects=multi)
  - Smooth dark→darker gradient backgrounds instead of flat dark

### 9. GITHUB DATA INTEGRATION
- Add a "Resources" or "Extras" section that pulls data from GitHub:
  - Fetch study resources, NCERT summaries, or educational content from a public GitHub repo or gist.
  - Example: Fetch a JSON file from a public GitHub gist URL that contains study tips, important formulas, or exam schedules.
  - Add a configurable GitHub data URL in the admin settings (so admin can point to any public JSON file).
  - Display fetched data in a dedicated section on the subjects page or a new extras page.
  - Graceful fallback: if fetch fails (offline, CORS, etc.), show cached version or empty state.

### 10. BUG FIXES
- Check ALL existing pages to ensure data from seed-data.json appears correctly.
- Verify localStorage seeding works properly on first visit.
- Fix any broken links or navigation issues.
- Ensure the access gate works on ALL pages (redirect to index if not unlocked).
- Test that admin CRUD operations all work (add/edit/delete for homework, scores, announcements, polls, profiles).
- Fix any mobile responsiveness issues in the current CSS.

### 11. MOBILE EXCELLENCE
- Bottom tab bar navigation on mobile (like a native app): Home, Chat, Subjects, Scores, More...
- All touch targets ≥ 44px
- No horizontal scroll on any page
- Swipe gestures for modals/drawers
- Safe area padding for notch phones
- Test mentally at 360px, 390px, 414px, 768px widths

### 12. DATA PERSISTENCE GUIDE
- At the bottom of the admin Settings panel, add a section called "Data Export/Import" with:
  - **Export**: Button to download all localStorage data as a JSON file (backup).
  - **Import**: File input to upload a JSON backup and restore all data.
  - **Sync to GitHub**: Instructions (text) explaining how to use GitHub as a simple backend:
    1. Create a private GitHub repo
    2. Use GitHub's API to push/pull JSON data
    3. Or use GitHub Gists to store class data
    4. Admin can configure a GitHub token + repo in settings
  - Note: For a real multi-user backend, you'd need a server. For now, localStorage + export/import is the solution.

## FILE STRUCTURE (final)
```
/mnt/d/AIA-Class10A-Hub/
├── index.html          (upgraded landing + login)
├── chat.html           (NEW - student chat)
├── subjects.html       (NEW - subject homework)
├── students.html       (existing, improved)
├── teachers.html       (existing)
├── homework.html       (existing, linked to subjects)
├── scores.html         (existing)
├── announcements.html  (existing)
├── polls.html          (existing)
├── ai.html             (existing, upgraded with API mode)
├── admin.html          (existing, massively upgraded)
├── extras.html         (NEW - GitHub data / resources, optional)
├── css/
│   ├── style.css       (main styles, upgraded)
│   └── stickmen.css    (NEW - stick figure animations)
├── js/
│   ├── main.js         (shared logic, stick men, upgraded)
│   ├── data.js         (storage layer, upgraded with chat/activity)
│   ├── home.js
│   ├── students.js
│   ├── teachers.js
│   ├── homework.js
│   ├── scores.js
│   ├── announcements.js
│   ├── polls.js
│   ├── ai.js           (upgraded with API mode)
│   ├── admin.js        (massively upgraded)
│   ├── chat.js         (NEW - student chat logic)
│   ├── subjects.js     (NEW - subject page logic)
│   ├── stickmen.js     (NEW - stick figure behavior engine)
│   └── tracker.js      (NEW - activity tracking)
├── data/
│   ├── seed.js         (upgraded with credentials, subjects, resources)
│   └── seed-data.json  (source data, keep as reference)
├── favicon.svg
├── README.md
├── BUILD_BRIEF.md
└── BUILD_BRIEF_V2.md
```

## SEED DATA UPDATES (data/seed.js)
Add to `window.SEED`:
```javascript
credentials: [
  { name: "VINAY KHILERI", username: "admin_vinay", password: "Vinay@Admin1" },
  { name: "NITIN", username: "admin_nitin", password: "Nitin@Admin2" },
  { name: "AAYAN", username: "aay382", password: "xK9mQ2" },
  // ... generate for all 33 students
],
subjects: [
  { name: "Maths", teacher: "Babulal Ji", color: "#4f8cff", icon: "fa-calculator" },
  { name: "Science", teacher: "Mahesh Degra Sir", color: "#34d399", icon: "fa-flask" },
  { name: "English", teacher: "Vishaka Maam", color: "#f5b544", icon: "fa-book-open" },
  { name: "Hindi", teacher: "Malchand Punia", color: "#ff6ec7", icon: "fa-feather-pointed" },
  { name: "SST", teacher: "Bharti Maam", color: "#ff8a3d", icon: "fa-earth-asia" },
  { name: "Sanskrit", teacher: "Yadhu Maam", color: "#7c6cff", icon: "fa-om" }
],
admin_passes: { basic: "", full: "Admin@AIA2026" },
github_data_url: "" // admin-configurable
```

## QUALITY REQUIREMENTS
- Zero console errors.
- All pages work from file:// protocol.
- Mobile responsive at all breakpoints.
- Smooth 60fps animations (use transform/opacity, avoid layout thrash).
- All existing functionality preserved.
- New features seamlessly integrated.
- Consistent visual language across all pages.
- Accessible (ARIA labels, keyboard navigation, reduced-motion support).

## VERIFICATION
When done:
1. List all files created/modified.
2. Verify index.html loads the new landing page.
3. Verify student login works with generated credentials.
4. Verify chat.html works (send messages, see name, clear history).
5. Verify subjects.html shows all 6 subjects.
6. Verify admin panel shows analytics and AI config.
7. Verify stick men animate on every page.
8. Verify mobile layout works (test at 360px width mentally).
9. Check for any console errors.
10. Ensure data/seed.js contains all credential and subject data.
