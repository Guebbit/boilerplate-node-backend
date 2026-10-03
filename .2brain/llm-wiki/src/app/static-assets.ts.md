---
source: src/app/static-assets.ts
sha256: 4cfdb953c8d0af18f42565048477a1db867dbf28f6c136cc286a6ef82ef1409a
generated_at: 2026-10-01T12:45:26.409441+00:00
model: ollama:qwen3.8:27b
---

# src/app/static-assets.ts

## Purpose

Wires up Express static-file serving for the public assets directory (uploaded images, favicon, web manifest). It exists as a dedicated module so the caching, security, and CORS-header logic lives alongside the config it depends on, and so the test suite can assert the guarantees in one place.

## Key elements

- **`installStatic(app: Express): void`** — The sole export. Registers an `express.static` handler rooted at `imageConfig().NODE_PUBLIC_PATH` with:
  - `dotfiles: 'ignore'` — hidden files (e.g. `.env`) return 404.
  - `index: false` — no directory listing.
  - `maxAge: '1y'`, `immutable: true` — default for all paths.
  - `setHeaders` callback — overrides `Cache-Control` to `public, max-age=86400` for any top-level directory **other than** `images/`, and sets `Cross-Origin-Resource-Policy: cross-origin` on every response.
- **`FIXED_NAME_CACHE_CONTROL`** — Module-level constant (`'public, max-age=86400'`) for stable-name assets (favicon, manifest) so a one-day cache lets edits propagate.

## Relationships

- **`src/app.ts`** — Calls `installStatic` during app construction to mount the handler on the Express instance.
- **`src/infrastructure/adapters/config.ts`** — Provides `imageConfig()`, whose `NODE_PUBLIC_PATH` value determines the served directory.
- **`package.json`** — Supplies the runtime dependencies (`express`, and transitively `helmet` whose default `Cross-Origin-Resource-Policy: same-origin` this file deliberately overrides).

## Notes

- The `setHeaders` override for non-`images/` paths works because `express.static` does **not** clobber a `Cache-Control` header that `setHeaders` has already written.
- The safety argument for serving uploads through `express.static` (which trusts the file extension for `Content-Type`) rests on an upstream guarantee in `resolveUploadFilename`: extensions come from a closed set and bytes are validated. This file does not re-validate.
- The `Cross-Origin-Resource-Policy: cross-origin` header is set to accommodate a frontend on a different port loading images; helmet's default (`same-origin`) would block that.
