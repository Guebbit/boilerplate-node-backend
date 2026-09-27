---
source: src/app/static-assets.ts
sha256: 7aedb9242623bd1932432f171e349111571f2d29c37490885db46e5bca8bca45
generated_at: 2026-09-27T14:03:12.599711+00:00
model: ollama:qwen3.8:27b
---

# src/app/static-assets.ts

## Purpose

Configures Express to serve public static assets (uploaded images, favicon, web manifest) directly from the application rather than a reverse proxy. Exists so that the security guarantees around file serving (extension allowlisting, byte verification, dotfile hiding) live inside the process where the test suite can assert them.

## Key elements

- **`FIXED_NAME_CACHE_CONTROL`** — constant `'public, max-age=86400'`; applied to assets that keep a stable filename across deploys (favicon, `site.webmanifest`).
- **`installStatic(app: Express): void`** — the sole export. Registers an `express.static` middleware on the given app, rooted at `NODE_PUBLIC_PATH` (default `'public'`). Sets security headers, disables dotfile access and directory listing, and applies tiered caching (see Notes).

## Relationships

- **`src/app.ts`** — imports and calls `installStatic(app)` to wire static serving into the Express application during bootstrap.
- **`package.json`** — declares the `express` and `node:path` runtime/dep entries this file imports.

## Notes

- **Two-tier cache:** files under the top-level `images/` directory inherit the middleware-level `maxAge: '1y'` + `immutable: true` (names are random or content-hashed, so bytes never change). Every other path gets `Cache-Control: public, max-age=86400` via the `setHeaders` callback, because those names are stable and can change on redeploy.
- **`Cross-Origin-Resource-Policy: cross-origin`** is set explicitly to override helmet's `same-origin` default; required because the frontend loads images from a different port.
- **Safety precondition:** the file *assumes* upstream code (`resolveUploadFilename`) restricts stored extensions to a closed set and verifies bytes. `express.static` derives `Content-Type` from extension, so without that guarantee a `.html` upload could be served as HTML. This file does not enforce it.
- The static root is an **absolute or relative path resolved against `cwd`** via `express.static`; the `path.relative(root, filePath)` call in `setHeaders` relies on `filePath` already being resolved by Express to an absolute path under `root`.
