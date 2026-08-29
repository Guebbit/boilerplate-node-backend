# public/images/seed/README.md

## Purpose
Documents the directory that holds committed seed-fixture images referenced by the demo seeder, and explains why this subdirectory is carved out from `public/images/` so that a single `.gitignore` rule can exclude runtime uploads without enumerating fixtures.

## Key elements
- **`/images/seed/<name>.jpg`** — URL pattern under which these fixtures are served; `db/demo/index.ts` uses it in `imageUrl` fields for products and users.
- **Rationale for the subdirectory** — `public/images/` as a whole is a runtime-upload destination (managed by `resolveUploadDestination` in `src/infrastructure/adapters/storage.ts`) and is `.gitignore`'d. Placing fixtures in `public/images/seed/` lets one ignore rule cover uploads while keeping fixtures tracked.

## Relationships
- **`db/demo/index.ts`** — Consumes the images by name in its seed data (`imageUrl: "/images/seed/<name>.jpg"`).
- **`src/app.ts`** — Mounts `express.static` that ultimately serves these files at the `/images/seed/…` path.
- **`src/infrastructure/adapters/storage.ts`** — Its `resolveUploadDestination` writes *other* files into `public/images/` (the parent), which is the directory `.gitignore` excludes; `public/images/seed/` is the exception that stays committed.

## Notes
- The images here are **repository content**, not runtime artifacts. Do not delete or rename them without updating the matching `imageUrl` strings in `db/demo/index.ts`.
- Adding a new fixture image requires **no** `.gitignore` change; the subdirectory convention handles that automatically.
