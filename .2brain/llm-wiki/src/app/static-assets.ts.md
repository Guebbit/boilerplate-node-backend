---
source: src/app/static-assets.ts
sha256: 5183a0330cf92864a799731c86bdc630799e82a940d351b1286cd36c286ecb0a
generated_at: 2026-09-23T17:36:14.815812+00:00
model: ollama:qwen3.8:27b
---

# src/app/static-assets.ts

## Purpose

Wires up Express's built-in static file handler to serve uploaded images and other public assets directly from the Node process (instead of a reverse proxy), keeping the behavior inside the test suite's reach.

## Key elements

- **`installStatic(app: Express): void`** — the sole export. Calls `app.use(express.static(...))` with the directory from `NODE_PUBLIC_PATH` (fallback `"public"`) and a fixed set of options:
    - `dotfiles: 'ignore'` — dotfiles under the public dir return 404.
    - `index: false` — disables directory listing.
    - `maxAge: '1y'` + `immutable: true` — aggressive caching (safe because filenames are 128-bit random).
    - `setHeaders` — forces `Cross-Origin-Resource-Policy: cross-origin` on every response (overrides helmet's `same-origin` default).

## Relationships

- **`src/app.ts`** — calls `installStatic(app)` during application setup to register this middleware.
- **`package.json`** — provides the `express` runtime dependency imported here.

## Notes

- Security of serving user uploads through `express.static` rests on an _upstream_ guarantee: `resolveUploadFilename` restricts extensions to a closed set and verifies bytes match, so `Content-Type` derivation can never yield `text/html` for an upload path. If that contract changes, the assumptions in this file's comments become invalid.
- The `cross-origin` CORP header is intentional: the paired frontend runs on a different origin/port and loads these images cross-origin. Removing or changing it will break the frontend.
- `immutable: true` + 1-year max-age means any change to a served file's bytes requires a new filename (which the upload pipeline already guarantees via random names). Do not repurpose this route for mutable content.
