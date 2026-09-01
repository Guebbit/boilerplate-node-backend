# src/app/static-assets.ts

## Purpose
Installs an `express.static` middleware that serves uploaded images and other public assets from a configurable directory. It centralises the caching and security headers for those files in one place rather than delegating to a reverse proxy, so the guarantees are testable within the app itself.

## Key elements
- **`installStatic(app: Express): void`** — the sole export. Calls `app.use(express.static(...))` with a path taken from `NODE_PUBLIC_PATH` (fallback: `'public'`). Configures:
  - `dotfiles: 'ignore'` — hidden files (e.g. `.env`) return 404.
  - `index: false` — no directory listing.
  - `maxAge: '1y'`, `immutable: true` — aggressive caching, justified by 128-bit random filenames.
  - `setHeaders` — overrides helmet's default by setting `Cross-Origin-Resource-Policy: cross-origin` so a paired frontend on a different port can load the asset.

## Relationships
- **`src/app.ts`** — the Express application instance that is passed into `installStatic`. This file is a pure middleware installer; it does not create or own the app.
- **`package.json`** — declares the `express` (and `@types/express`) dependency used here.

## Notes
- Safety against serving arbitrary bytes as `text/html` relies on **upstream** code (`resolveUploadFilename`), not on this file. If that upstream guarantee is weakened, the static handler will happily serve HTML from upload paths.
- The `NODE_PUBLIC_PATH` env var is read at call time (i.e. when `installStatic` is invoked), not at import time, so it can be set in test setup before the app is built.
- The `immutable` + 1-year cache is only sound because filenames are content-agnostic random tokens. Do not rename or reuse a path under `public/` expecting new bytes to appear.
