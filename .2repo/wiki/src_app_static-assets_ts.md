# src/app/static-assets.ts

## Purpose

Configures Express to serve static files (user uploads and other public assets) directly from the Node process rather than offloading to a reverse proxy. This keeps the serving guarantees (security headers, MIME handling, cache policy) inside the application's testable surface.

## Key elements

- **`installStatic(app: Express): void`** — Registers `express.static` on the given app. Serves from `process.env.NODE_PUBLIC_PATH ?? 'public'` with the following options:
  - `dotfiles: 'ignore'` — dotfiles under the public dir return 404, preventing accidental disclosure (e.g. a stray `.env`).
  - `index: false` — disables directory listing so upload filenames remain unguessable.
  - `maxAge: '1y'`, `immutable: true` — filenames are 128 bits of randomness, so cached bytes are permanent.
  - `setHeaders` — forces `Cross-Origin-Resource-Policy: cross-origin` to override helmet's default `same-origin`, allowing the paired frontend (served on a different port) to load images.

## Relationships

- **`src/app.ts`** — Imports and calls `installStatic` during app bootstrap to wire the static route into the Express instance.
- **`package.json`** — Provides the `express` dependency that this module imports (both value and type).

## Notes

- The doc comment states that `express.static` derives `Content-Type` from the file extension, so it can never emit `text/html` for an upload path. This safety depends on an *upstream* guarantee: `resolveUploadFilename` (lives elsewhere in the codebase) restricts extensions to a closed set and verifies file bytes match. The two invariants are coupled; changing either without the other can break the MIME-safety argument.
- The `Cross-Origin-Resource-Policy` header is deliberately overridden per-route here rather than configured globally via helmet, because JSON endpoints should keep `same-origin`.
