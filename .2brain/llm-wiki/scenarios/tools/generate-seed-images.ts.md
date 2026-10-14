---
source: scenarios/tools/generate-seed-images.ts
sha256: 13df61206492f7ef0d77c0fd024ed73e379b58e3b4ecd257030636318f7be57e
generated_at: 2026-10-14T07:05:59.877529+00:00
model: ollama:qwen3.8:27b
---

# scenarios/tools/generate-seed-images.ts

## Purpose

One-off CLI script (`npm run scenario:images`) that downloads a fixed-size photo per catalogue role from Lorem Picsum, runs it through the same `digestImage`/`thumbnailImage` pipeline a real upload uses, and writes the results into `public/images/seed/` along with two generated JSON manifests. It exists so the demo catalogue holds locally-committed, production-identical image bytes rather than hand-placed files or hot-linked URLs.

## Key elements

- **`PRODUCT_ROLES`** — Array of five named product roles plus `FILLER_IMAGE_ROLE_KEYS`; the roles that each get a seeded image. `barebones` is intentionally absent.
- **`USER_ROLES`** — `['root', 'customer']`; the two account avatars that generated customers cycle between.
- **`fetchSourcePhoto(picsumSeed)`** — Downloads an 800×600 JPEG from `picsum.photos/seed/{seed}/800/600`; the seed segment makes the call reproducible.
- **`randomName(extension)`** — Produces a 32-char hex filename (16 random bytes) mirroring the convention in `http/middlewares/upload.ts`.
- **`generateOne(manifestKey, picsumSeed)`** — Fetches, digests, thumbnails, writes both files to disk, and returns the `{ imageUrl, thumbnailUrl }` pair for the manifest.
- **`removeStale(directory, extension, keep)`** — Deletes files of a given extension in a single directory whose names are not in the `keep` set, so retired roles don't leave orphaned bytes.
- **`writeManifest(relativePath, manifest)`** — Serialises a role→`ImageEntry` map to `scenarios/*-images.generated.json` (4-space indent, trailing newline).
- **`main()`** — Orchestrates: creates directories, iterates all roles, sweeps stale files, writes both manifests.

## Relationships

- **`scenarios/products-filler.ts`** — Imports `FILLER_IMAGE_ROLE_KEYS` so the filler product pool's image roles are part of this script's download list without being hard-coded here.
- **`src/infrastructure/adapters/image.ts`** — Imports `digestImage` and `thumbnailImage`; the seed pipeline reuses the exact same processing a real upload receives.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import at the top; loads `.env` so `NODE_IMAGE_MAX_DIMENSION` and other image-adapter settings are available.

## Notes

- **Reproducible but destructive.** Re-running overwrites both `*-images.generated.json` manifests and deletes any `.jpg`/`.webp` in `public/images/seed/` (or `thumbs/v1/`) that this run's role list no longer names. A renamed role's old file is swept on the next run.
- **Not part of `npm run regenerate`.** The output is binary and the team reviews it before committing; the script is deliberately separated from the text-fixture regeneration flow.
- **Thumbnail path is `thumbs/v1/` inside `seed/`, not the runtime `images/thumbs/v1/`.** This keeps both the original and its thumbnail under the single `!public/images/seed/` gitignore carve-out, avoiding an extra `.gitignore` entry.
- **800×600 fetch size is intentional.** `digestImage` only downscales (to `NODE_IMAGE_MAX_DIMENSION`, default 2048); a larger fetch would just waste bandwidth since the images are only shown at catalogue-card size.
- **Picsum seeds are namespaced** (`product-{role}` vs `user-{role}`) so a product and a user role sharing a word never resolve to the same photo.
- **Manifests are generated, not hand-edited.** `scenarios/products.ts`, `scenarios/products-filler.ts`, and `scenarios/users.ts` read the two `*-images.generated.json` files at runtime.
