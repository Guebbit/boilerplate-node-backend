---
source: src/app/static-assets.ts
source_sha256: 4cfdb953c8d0af18f42565048477a1db867dbf28f6c136cc286a6ef82ef1409a
context_sha256: 8e0de5bde2ed12da05a91e330e6bf0f125927b597de9dde404889a934cb71fdf
generated_at: 2026-11-22T02:31:40.918013+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/static-assets.ts

## Purpose
Installs the Express middleware that serves uploaded images and other public assets from disk. It is served by the app itself rather than a reverse proxy, so its safety and caching guarantees can be covered by the test suite.

## Key elements
- `installStatic(app: Express): void` — the only export. Reads `imageConfig().NODE_PUBLIC_PATH` as the root and mounts `express.static` on the app with these options:
  - `dotfiles: 'ignore'` — files such as `.env` return 404.
  - `index: false` — no directory index or listing.
  - `maxAge: '1y'` with `immutable: true` — the default cache policy.
  - `setHeaders` — sets `Cross-Origin-Resource-Policy: cross-origin` on every file. For any file whose top-level directory under the root is not `images`, it overrides `Cache-Control` with `FIXED_NAME_CACHE_CONTROL`.
- `FIXED_NAME_CACHE_CONTROL` (private const) — `'public, max-age=86400'`, one day. It applies to fixed-name assets such as the favicon and web manifest, so edits to them reach clients.

## Relationships
- `src/infrastructure/adapters/config.ts` — supplies `imageConfig()`, which provides `NODE_PUBLIC_PATH`, the directory being served.
- `src/app.ts` — expected to call `installStatic` with the Express app. This is inferred from the dependency graph, not visible in this file.
- `package.json` — the graph links it, presumably because of the `express` dependency. Nothing else in this file refers to it.

## Notes
- Safety against serving HTML from an upload path depends on upstream code, not on this file. According to the comments, stored extensions come from a closed set (`resolveUploadFilename`) and the file bytes are verified to match. `express.static` derives `Content-Type` from the extension.
- `Cross-Origin-Resource-Policy: cross-origin` is set because helmet's default `same-origin` would block a paired frontend on another port from loading images.
- The `images/` directory is treated as immutable because its filenames are random or content-hashed. Everything else gets the one-day cache.
- The `Cache-Control` override in `setHeaders` works because `express.static` does not replace a `Cache-Control` header that is already set.
- The root is read once when `installStatic` runs, so changing `NODE_PUBLIC_PATH` later has no effect.
