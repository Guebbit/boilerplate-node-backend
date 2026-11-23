---
source: scenarios/tools/generate-seed-images.ts
generated_at: 2026-11-22T01:49:28.729137+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/tools/generate-seed-images.ts

## Purpose
A one-off CLI script (`npm run scenario:images`, run via `tsx`) that generates the demo catalogue's images. It downloads a seeded photo per role from Lorem Picsum and passes it through the same digest/thumbnail pipeline used for real uploads. The results are committed under `public/images/seed/`, so the seed images are processed like production output and never hand-placed or hot-linked. It also writes two JSON manifests that the scenario files read.

## Key elements
- `SEED_ROOT` / `THUMBS_ROOT`: output directories, `public/images/seed` and `public/images/seed/thumbs/v1`.
- `ImageEntry`: `{ imageUrl, thumbnailUrl }` public paths for one role.
- `PRODUCT_ROLES`: five named product roles (`dogFoodStandard`, `heaterSoftDeleted`, `scratchPostOutOfStock`, `dogBedPremium`, `bundleInactive`) plus `FILLER_IMAGE_ROLE_KEYS`. `barebones` is deliberately absent because it has no image.
- `USER_ROLES`: `root` and `customer`.
- `fetchSourcePhoto(picsumSeed)`: fetches `https://picsum.photos/seed/<seed>/800/600` with global `fetch` and throws on a non-OK response.
- `randomName(ext)`: 16 random bytes as hex plus an extension. This mirrors the upload middleware's naming.
- `generateOne(manifestKey, picsumSeed)`: fetches the photo, then runs `digestImage(source, 'image/jpeg')` and `thumbnailImage(source)`. It writes a `.jpg` and a `.webp` and returns the `ImageEntry`.
- `removeStale(directory, extension, keep)`: deletes files in one directory (not recursive) that have the given extension and are not in `keep`.
- `writeManifest(relativePath, manifest)`: writes JSON with 4-space indent and a trailing newline.
- `main()`: creates the directories, generates product images (seed `product-<role>`) and user images (seed `user-<role>`), sweeps stale `.jpg` and `.webp` files, then writes both manifests.

## Relationships
- `src/infrastructure/adapters/image.ts`: provides `digestImage` and `thumbnailImage`, the same pipeline as real uploads.
- `scenarios/products-filler.ts`: provides `FILLER_IMAGE_ROLE_KEYS`, the fixed pool of filler roles to download. Per the file's header comment, it is also among the scenario files that read the generated manifests.
- `src/infrastructure/config/dotenv.ts`: imported for its side effect, which loads environment config before the image adapter runs. Its contents are not visible here.

## Notes
- It is not part of `regenerate`. It needs the network, and its binary output should be eyeballed before commit.
- Output is reproducible because each Picsum `seed` path segment pins its photo. Filenames are random each run, so the committed files and manifests change on every run.
- It overwrites both generated manifests (`products-images.generated.json` and `users-images.generated.json` under `scenarios/`) and deletes any `*.jpg` in `seed/` and `*.webp` in `seed/thumbs/v1/` that the current run didn't write. Other files, such as `README.md`, and nested directories are left alone.
- Thumbnails go to `seed/thumbs/v1/`, not the runtime `images/thumbs/v1/`. This keeps them inside the directory `.gitignore` already commits.
- The product and user Picsum seeds are prefixed (`product-`, `user-`) so roles that share a name don't fetch the same photo.
- The fetch is 800×600 because `digestImage` never upscales.
- Roles are processed sequentially. Any failure prints the stack and sets `process.exitCode = 1`.
