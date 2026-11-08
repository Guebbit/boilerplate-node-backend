---
source: src/app/static-assets.ts
sha256: 4cfdb953c8d0af18f42565048477a1db867dbf28f6c136cc286a6ef82ef1409a
generated_at: 2026-11-08T03:14:19.515272+00:00
model: ollama:qwen3.8:27b
---

# src/app/static-assets.ts

## Purpose

Installs an `express.static` middleware that serves public assets (uploaded images, favicon, web manifest) from a configured directory. It exists in-process rather than behind a reverse proxy so that caching, security, and CORS behavior are covered by the project's own test suite.

## Key elements

- **`installStatic(app: Express): void`** — the sole export. Registers `express.static` on the given Express app with:
  - `dotfiles: 'ignore'` and `index: false` for security (no dotfile disclosure, no directory listing).
  - `maxAge: '1y'` + `immutable: true` as the base, then a `setHeaders` callback overrides `Cache-Control` to a 1-day policy for any path **not** under the `images/` top-level directory.
  - Sets `Cross-Origin-Resource-Policy: cross-origin` on every response (overriding helmet's default `same-origin`).
- **`FIXED_NAME_CACHE_CONTROL`** — module-level constant (`public, max-age=86400`) applied to non-image assets whose names are stable across edits (favicon, `manifest.json`, etc.).

## Relationships

- **`src/app.ts`** — the caller; invokes `installStatic` during Express app construction to wire the static handler into the middleware chain.
- **`src/infrastructure/adapters/config.ts`** — provides `imageConfig()`, whose `NODE_PUBLIC_PATH` property is the filesystem root that `express.static` serves.
- **`package.json`** — declares the `express` (and `@types/express`) dependency used here.

## Notes

- The `images/` subdirectory is treated as content-addressed (random or hashed names), hence the aggressive 1-year immutable cache. Everything else at the top level uses a 1-day cache so edits to a favicon or web manifest propagate quickly.
- The safety argument for using `express.static` (which sets `Content-Type` from the file extension) is documented in the comment: upstream, `resolveUploadFilename` restricts extensions to a closed set and byte-verification is performed, so an upload path can never yield `text/html`.
- `path.relative(root, filePath).split(path.sep)` is used to identify the top-level directory name without importing a platform-agnostic helper; it assumes a single-segment top directory (`images` vs. everything else).
