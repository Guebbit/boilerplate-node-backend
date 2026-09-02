# scripts/generate-seed-images.ts

## Purpose

One-off CLI (`npm run seed:images`) that downloads a deterministic photo per demo role from Lorem Picsum, runs each through the production digest/thumbnail pipeline, writes the results into `public/images/seed/`, prunes stale originals, and emits the two `demo-images.generated.json` manifests that `demo.ts` and `demo-catalog.ts` consume at seed time.

## Key elements

- **`PRODUCT_ROLES` / `USER_ROLES`** – fixed arrays of role names that require an image (`barebones` is intentionally absent). `PRODUCT_ROLES` is extended with `FILLER_IMAGE_ROLE_KEYS` so the pool is independent of grid size.
- **`fetchSourcePhoto(picsumSeed)`** – GETs `picsum.photos/seed/{seed}/1600/1200`; the seed makes the response reproducible.
- **`generateOne(manifestKey, picsumSeed)`** – core per-role pipeline: fetch → `digestImage` → `thumbnailImage` → write both files under `public/images/seed/` (original `.jpg` at root, thumbnail `.webp` under `thumbs/v1/`) → return the two URL paths.
- **`removeStaleOriginals(keep)`** – deletes every top-level `.jpg` in `seed/` whose basename isn't in the `keep` set; never touches subdirectories or non-`.jpg` files.
- **`writeManifest(relativePath, manifest)`** – serialises a role→`ImageEntry` map as pretty-printed JSON.
- **`main()`** – creates directories, iterates both role lists, prunes, writes manifests.
- **`ImageEntry`** – `{ imageUrl, thumbnailUrl }` shape persisted in the generated manifests.

## Relationships

- **`src/infrastructure/adapters/image.ts`** – imports `digestImage` and `thumbnailImage` so seed images pass through the exact same strip/cap/recompress steps as a real user upload.
- **`src/modules/products/demo-catalog.ts`** – imports `FILLER_IMAGE_ROLE_KEYS` to enumerate filler roles; the script writes `src/modules/products/demo-images.generated.json` alongside it for `demo.ts` to read at catalogue-generation time.

## Notes

- Deliberately excluded from `npm run regenerate`: output is binary and warrants a human glance before committing.
- Re-running is **destructive** to the directory: it overwrites both manifests and deletes any top-level `.jpg` in `seed/` not produced by the current role list (including the six hand-placed originals that predate the catalogue).
- Thumbnails are written to `seed/thumbs/v1/`, *not* the runtime `images/thumbs/v1/`, so everything stays inside the single `!public/images/seed/` gitignore exception — no extra ignore rules needed.
- `manifestKey` and the Picsum `seed` are namespaced with `product-` / `user-` prefixes to guarantee a product and a user role sharing a word never resolve to the same photo.
- File names are 16 random hex bytes (`randomBytes(16)`), matching the `resolveUploadFilename` convention in `storage.ts`; never derived from the role name.
