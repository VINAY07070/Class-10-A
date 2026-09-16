# Login and broken-site fixes

## Fixed on develop
- Restored `DataStore` loading through `js/data.js`.
- Restored seed data loading through `data/seed.js`.
- Restored home and page modules through compatibility entry points.
- Restored CSS from the original root stylesheets.
- Added a polished responsive login layer in `css/login.css`.
- Added a fallback `404.html`.

## Login test
Use a credential from `seed.js`, for example:
- Username: `AAY941`
- Password: `gLZbCK`

Admin examples are also present in the client seed data. This is suitable only for a demo/static site, not real authentication.
