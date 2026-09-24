---
source: scenarios/tools/generate-seed-images.ts
sha256: 128da43c835bb1da1606ed09b6d919f279284c5e54423fac526581c560d08159
generated_at: 2026-09-23T17:20:32.978946+00:00
model: ollama:qwen3.8:27b
---

# scenarios/tools/generate-seed-images.ts

## Purpose

One-off script (`npm run scenario:images`) that downloads a real photo per catalogue role from Lorem Picsum, processes it through the same digest/thumbnail pipeline as production uploads, and writes the results plus two generated manifest JSONs. It exists so `public/images/seed/` contains byte-identical-to-production image output without hand-placed files or hot-linked URLs, and so the manifests consumed by the scenario fixtures are never hand-edited.

## Key elements

- **`PRODUCT_ROLES`** — the five named product roles (minus `barebones`, which intentionally has no image) plus the `FILLER_IMAGE_ROLE_KEYS` pool; each gets one image pair.
- **`USER_ROLES`** — `['root', 'customer']`; the two avatar slots cycled by generated customers.
- **`fetchSourcePhoto(picsumSeed)`** — downloads an 800×600 JPEG from `picsum.photos/seed/<seed>/800/600`; the seed path makes re-runs reproducible.
- **`generateOne(manifestKey, picsumSeed)`** — orchestrates one role: fetch → `digestImage` → `thumbnailImage` → write both files with random 128-bit hex names → return an `ImageEntry` (`imageUrl` + `thumbnailUrl`).
- **`removeStale(directory, extension, keep)`** — deletes any file in that directory (non-recursive) with the given extension whose basename isn't in `keep`; used to sweep orphans left by renamed/dropped roles.
- **`writeManifest(relativePath, manifest)`** — serialises a `Record<string, ImageEntry>` as 4-space-indented JSON to the given repo-relative path.
- **`main()`** — creates output dirs, iterates product and user roles, calls `generateOne` for each, sweeps stale `.jpg`/`.webp` files, writes `scenarios/products-images.generated.json` and `scenarios/users-images.generated.json`.
- **`SEED_ROOT` / `THUMBS_ROOT`** — `public/images/seed/` and `public/images/seed/thumbs/v1/` respectively; both are already committed via a `.gitignore` exception.

## Relationships

- **`src/infrastructure/adapters/image.ts`** — imports `digestImage` and `thumbnailImage`. Every downloaded photo passes through the exact same pipeline a real upload uses, guaranteeing the seed bytes match production output (stripped, capped, recompressed).
- **`scenarios/products-filler.ts`** — imports `FILLER_IMAGE_ROLE_KEYS`. This constant is appended to `PRODUCT_ROLES` so the filler image pool is always generated alongside the named-role images; `scenarios/products.ts` then cycles through the combined pool when filling out the catalogue grid.

## Notes

- Deliberately **not** part of `npm run regenerate`: its output is binary and the team wants a human to glance at it before committing.
- Re-running is **destructive**: it overwrites both manifests and deletes any `seed/*.jpg` or `thumbs/v1/*.webp` not produced by the current run's role list. A renamed role orphans one original and one thumbnail; both are swept.
- Picsum seeds are namespaced with a `product-` or `user-` prefix (`product-dogBedPremium`, `user-root`) so a product and a user role that share a word never collide on the same photo.
- Thumbnails are written to `seed/thumbs/v1/` (not the runtime `images/thumbs/v1/`) to stay inside the single `.gitignore` exception for `public/images/seed/`.
- `800×600` fetch size is chosen because `digestImage` only downscales to `NODE_IMAGE_MAX_DIMENSION` (2048); fetching larger would just waste bandwidth.
- Filenames are 16 random bytes as hex — never derived from the role name — matching the convention in `http/middlewares/upload.ts`.
