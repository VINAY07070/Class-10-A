# AGENTS.md — AIA Class 10-A Hub

Static multi-page class portal. HTML + CSS + vanilla JS. **No build step.**
Must work when opened directly via `file://` as well as served over HTTP.

## ACTIVE SCOPE — work ONLY on these four items. Nothing else, ever.

The user has asked repeatedly and emphatically that work is limited to the list
below. Do NOT refactor, optimise, restyle, or "improve" anything outside it —
not the stickman art, not page-load speed, not the script-loader chain, not CSS,
not unrelated pages. If you spot an unrelated bug, report it; do not fix it.

1. **AI usable by all users via the admin's shared AI setup.**
   Implemented (admin share toggle + wrapped key in `data.js`, consumed by
   `ai.js`). NOT yet tested.
2. **Each user's AI chat history stays private.**
   Exclusion of `aia_ai_chat_*` from sync started; not finished or tested.
3. **Private chat: admin → student delivery, and the missing student-side
   section.** Admin sends, student sees nothing and no section appears.
   Only investigated; NOT fixed.
4. **Profile-edit section for users** (profile only, nothing else).
   Not started.

Acceptance for each is behavioural: prove it in a browser across two devices
(or two contexts) before calling it done.

## Layout (easy to get wrong)

Pages live in the repo root (`index.html`, `chat.html`, `admin.html`, …), but
they load their scripts through thin shim files in `js/` and `css/`:

```
index.html  ->  <script src="js/main.js">   ->  document.write('<script src="main.js">')
                                                 (written into the root page)
```

Because the shim is *written into the root page*, its `src` is resolved from
the page's own directory — root. So shims must reference **`"main.js"`**, not
`"../main.js"`.

- `../main.js` works over HTTP (resolves to `/main.js`, clamped at root) but
  **fails on `file://`**, which is an explicit requirement. That single mistake
  makes every page load zero scripts (no `DataStore`, no `AiaRelay`, no sync).
- CSS shims in `css/` are different: `@import` resolves relative to the **CSS
  file**, so those correctly keep `url('../style.css')`.

Rule of thumb: when fixing asset paths, verify on `file://` — HTTP alone hides
this class of bug.

## Content

`data/seed.js` is the loaded copy of `data/seed-data.json`. `seed.js` also
carries extras the site needs: `credentials`, `admin_passes`, `subjects`,
`github_data_url`. Do **not** invent students/teachers/homework/announcements/
polls/scores — all such content must trace back to that file.

## Serverless sync

`sync-bridge.js` merges state across tabs/devices via `localStorage`,
`BroadcastChannel`, and `storage` events. `relay.js` adds cross-device sync
through a public ntfy relay (SSE primary, polling fallback). Every synced key
must be registered in `SYNC_DEFS` in `sync-bridge.js` **and** mapped in
`data.js` / `relay.js`; an unmapped key silently never syncs.

- `aia_theme` is stored as a plain string, not JSON — it is special-cased in
  `readKey`/`writeKey`. Writing it as JSON breaks theme sync.
- When testing sync, mutate through `DataStore.setX(...)` so the
  `aia-local-write` event fires. Writing `localStorage` directly (and feeding
  `JSON.parse` a bare string) produces false failures.
- The free relay rate-limits aggressively (HTTP 429). `es.onerror` uses
  exponential backoff; do not shorten it.

### The catch-up cursor (easy to break)

A device opening *after* someone wrote must replay the room history, or it
silently never sees that data. Two rules keep this working:

1. `bootSince` is captured at module load, before the SSE stream can touch
   `lastTime`, and `handleNtfyEvent` must not call `markSeen` until
   `catchupDone`. Otherwise the live echo of our own presence moves the
   cursor to "now" and the replay asks for nothing.
2. The first catch-up replays `CATCHUP_WINDOW`; later page loads only fetch
   since `lastTime`. `AiaRelay.resync()` forces a full replay.

Catch-up fetches **one** relay and stops on a non-empty body. It used to
fetch all three in parallel, downloading the whole room three times over.
`ingest()` also parses in ~8 ms slices with `setTimeout` yields, and skips
`HISTORY_SKIP` keys (`al`, `pr`) — presence/activity heartbeats were ~97% of
the 850 KB history and are useless when stale (fresh ones arrive live).
Measured with the relay off vs on, long tasks on first load are identical,
so the sync path costs no main-thread time.

## Performance

`perf.js` adds `perf-lite` on constrained devices; `perf.css` holds the
reduced-motion/lite styles; `main.js` adapts the particle field; `stickmen.js`
throttles its frame loop. Keep the animation budget measured on a throttled
CPU — the project targets a steady 60 fps at 4–10x slowdown.

## Auth

`auth-bridge.js` POSTs `/api/login` only over http(s). On `file://` it goes
straight to the local credential check, so opening the pages offline does not
log spurious network errors.

## Verify

```bash
# serve for HTTP checks
python3 -m http.server 12000

# then in a browser/Playwright, load each page over BOTH file:// and http://
# and assert: no page errors, DataStore/AiaSync/AiaRelay/AiaFiles defined
```

Stickmen mascots should read as classic stick figures: open stance, line limbs,
outlined hoop head. Avoid trailing strokes off the headband — they read as a
ponytail and make the mascot look feminine.

## Mascots

Vinay and Nitin are the two stickmen (`stickmen.js`, v5). The pig is
**Premeshwar** (`pig.js`) and his nameplate is the `.pig-tag` element — keep
the spelling exactly "Premeshwar".

Adding a new mascot activity means four edits in `stickmen.js`, not one:

1. a `do<Name>(F, ms)` wrapper using `gesture(F, '<name>', ms)`
2. a pose branch in `renderFigure` for `F.mode === '<name>'`
3. the mode name in the long timer branch in `updateFigure` that clears the
   mode when `p >= 1`
4. a slot in the `schedule()` ladder (`r < 0.xx`) and optionally in the
   `StickMen.act` public API

`startFight()` is the only multi-figure activity; it chains `walkTo` callbacks
and `fightBlow` exchanges. It is rate-limited by `fightCd`.

## Presentation layers

Load order matters. `css/style.css` is an `@import` shim loaded by every
subpage; `style.css` (root) is the base sheet. The shim order is
base → mobile → perf → pig → extras → polish → signature, and the same
sequence for JS in `js/main.js`. `signature.css`/`signature.js` are last on
purpose: that is what lets the signature rules win specificity fights without
`!important`.

The signature layer adds identity from the existing DOM and must stay
additive: no page markup should depend on it. `Signature.init()` is
idempotent and re-runs on a MutationObserver, so it survives pages that
re-render after login.

Do not use `body::before` / `body::after` for new decoration — both are
already taken by the base theme and `polish.css`. Use a real element (see
`.sig-wash`).

## Phone performance

`perf.js` sets `html.perf-lite` on phones and low-power devices. Keep all
new animation gated behind it: `html.perf-lite .thing { animation: none; }`
or an early return in JS (`P.lite`). The phone target is 60fps on every page
and no horizontal overflow.