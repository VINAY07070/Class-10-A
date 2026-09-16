# Static deployment check

The project is a static site and can be deployed to GitHub Pages, Netlify, Vercel, or any static web server. It uses browser `localStorage` for demo data and authentication, so there is no server-side database or secure authentication. Do not use the bundled credentials for real personal data.

Important: run it through HTTP (`python -m http.server 8000`), not by double-clicking `index.html`. The compatibility entry points keep the current root files working while the project is migrated into folders.

Known limitations:
- Data is per-browser and is not shared between users.
- Credentials are visible in client-side JavaScript and are not production security.
- External Google Fonts, Font Awesome, and GSAP require network access.
