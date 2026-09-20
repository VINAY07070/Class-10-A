# AGENTS.md — AIA Class 10-A Hub

Static multi-page class portal. HTML + CSS + vanilla JS. **No build step.**
Must work when opened directly via `file://` as well as served over HTTP.

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