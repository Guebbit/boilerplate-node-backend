---
source: scenarios/tools/generate-seed-images.ts
sha256: 13df61206492f7ef0d77c0fd024ed73e379b58e3b4ecd257030636318f7be57e
generated_at: 2026-11-08T02:35:30.436284+00:00
model: ollama:qwen3.8:27b
---

# scenarios/tools/generate-seed-images.ts

## Purpose

One-off CLI script (`npm run scenario:images`) that downloads a pinned photo per catalogue role from Lorem Picsum, runs it through the same digest/thumbnail pipeline a real upload uses, and writes the resulting files to `public/images/seed/` along with two `*-images.generated.json` manifests. It exists so the demo catalogue's images are pipeline-processed bytes rather than hand-placed files or hot-linked URLs, while remaining reproducible and cheap to regenerate.

## Key elements

- **`PRODUCT_ROLES`** – Array of the five named product roles that carry an image (plus `FILLER_IMAGE_ROLE_KEYS`); `barebones` is deliberately excluded.
- **`USER_ROLES`** – `['root', 'customer']`; every generated customer cycles between these two avatars.
- **`fetchSourcePhoto(picsumSeed)`** – Downloads an 800×600 JPEG from `picsum.photos/seed/<seed>/800/600`; the seed pin makes re-runs deterministic.
- **`randomName(ext)`** – Produces a 16-byte-hex filename, matching the convention in `http/middlewares/upload.ts`.
- **`generateOne(manifestKey, picsumSeed)`** – Orchestrates fetch → `digestImage` → `thumbnailImage` → write both files; returns the `ImageEntry` (URLs) for the manifest.
- **`removeStale(directory, extension, keep)`** – Deletes files directly in `directory` with the given extension that are *not* in the `keep` set, pruning orphans from renamed/dropped roles.
- **`writeManifest(relativePath, manifest)`** – Serialises a role→`ImageEntry` map as 4-space-indented JSON with a trailing newline.
- **`main()`** – Creates output dirs, iterates all product and user roles, sweeps stale `.jpg`/`.webp` files, writes both manifests.
- **`ImageEntry`** – `{ imageUrl, thumbnailUrl }` shape stored in the generated manifests.

## Relationships

- **`scenarios/products-filler.ts`** – Provides `FILLER_IMAGE_ROLE_KEYS`, the fixed pool of filler product roles whose images this script also generates; `scenarios/products.ts` later cycles through them, so growing the catalogue grid never requires a new download.
- **`src/infrastructure/adapters/image.ts`** – Supplies `digestImage` and `thumbnailImage`; the script routes every seed photo through these so the committed bytes are byte-identical in behaviour to a production upload (stripped, capped, recompressed).
- **`src/infrastructure/config/dotenv.ts`** – Imported as a side-effect at the top of the module to load environment variables (e.g. `NODE_IMAGE_MAX_DIMENSION`) before the image pipeline reads them.

## Notes

- **Not in `npm run regenerate`.** The output is binary and intended for human review before committing; running it is a separate, deliberate step.
- **Destructive on re-run.** Overwrites both manifests and deletes any `public/images/seed/*.jpg` or `*.webp` not named by the current role list. A retired role's file does not linger.
- **Thumbnail location.** Seed thumbnails land in `public/images/seed/thumbs/v1/`, *not* the runtime `images/thumbs/v1/`. This keeps everything inside the directory that `.gitignore` already un-ignores (`!public/images/seed/`) without an extra `.gitignore` edit.
- **Picsum seed namespacing.** The seed passed to Picsum is prefixed (`product-…` / `user-…`) so a product role and a user role that share a word never resolve to the same photo.
- **800×600 fetch size is deliberate.** `digestImage` only downscales to `NODE_IMAGE_MAX_DIMENSION` (default 2048); fetching larger would download extra bytes that are immediately discarded.
- **Manifests are generated, never hand-edited.** `scenarios/products.ts`, `scenarios/products-filler.ts`, and `scenarios/users.ts` all read the `*-images.generated.json` files this script produces.
