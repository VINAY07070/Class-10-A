# Static-only temporary synchronisation

This build includes `DataSync` in `js/data.js`.

- `BroadcastChannel` syncs DataStore changes between open tabs/windows on the same origin.
- The browser `storage` event refreshes other tabs when BroadcastChannel is unavailable.
- `DataSync.exportData()` returns a JSON backup.
- `DataSync.importData(json)` restores a JSON backup.

This cannot synchronise different phones or users without a server or third-party hosted data service. For cross-device sync later, use a backend such as Supabase/Firebase or a server API. Static client-side credentials are also not secure for real accounts.

The stickmen were replaced with simple iconic line figures. They are positioned in a fixed bottom strip, above the mobile tab bar and safe-area inset, with bounded horizontal movement.

All students already have credentials in `seed.js`; the current list contains one credential for every listed student. Because this is a static site, those credentials are visible to anyone who downloads the site and should only be treated as demo credentials.
