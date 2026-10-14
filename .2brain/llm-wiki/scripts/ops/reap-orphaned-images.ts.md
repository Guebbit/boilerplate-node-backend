---
source: scripts/ops/reap-orphaned-images.ts
sha256: 42aad0a5849ffbef1d762eb918ad42e893e83b4300d859314f57c3cd6bbdca69
generated_at: 2026-10-14T07:25:18.325736+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-orphaned-images.ts

## Purpose
Deletes image files and their thumbnails under `public/images/` that no live document references. Orphans accumulate from two sources: uploads that were promoted to disk but whose DB row was never written (dropped connection), and throwaway databases (`demo`, e2e) reseeded while the underlying files persist. Runs nightly via `docker/crontab` or manually after a demo/e2e cycle.

## Key elements

- **`MIN_AGE_MS`** (60 min) — files younger than this are never swept; an upload is promoted to disk a moment before its row is saved, so a sweep must not race that write.
- **`referencedFilenames(): Promise<Set<string>>`** — queries every `imageTargets`-registered collection (via the raw Mongoose driver, not a module repository) for `imageUrl` and `thumbnailUrl` values, returning the set of basenames still in use.
- **`main()`** — resolves the public root, builds the keep-set, then calls `pruneUnreferenced` on the originals directory and the thumbnails directory separately; logs a summary via `logger.info`.
- **`runScript('reap:orphaned-images', main, stopDatabase)`** — entry-point wrapper that starts the job, runs `main`, records the outcome for `/observability/health`, and closes the DB on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` lifecycle wrapper (job timing, observability recording, DB close) that this file delegates its entry point to.
- **`src/infrastructure/adapters/filesystem.ts`** — exports `pruneUnreferenced`, the actual filesystem walker/deleter; this script supplies the directory, keep-set, and minimum age.
- **`src/infrastructure/adapters/image-store.ts`** — exports the path constants/helpers (`IMAGES_SEGMENT`, `publicRoot`, `thumbnailsDirectory`) used to locate the directories to scan.
- **`src/kernel/registry.ts`** — `resolveImageTargets(enabledModules)` enumerates every collection that stores image URLs, so this script can query them generically without hardcoding.
- **`src/modules.ts`** — `enabledModules` is the input to `resolveImageTargets`; adding a new module with an image target requires no change here.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the connection; `stopDatabase` is passed to `runScript` as the cleanup callback.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported before any model loads so Mongoose defaults are set at schema-build time.
- **`src/infrastructure/config/dotenv.ts`** — imported first to load environment variables.
- **`src/infrastructure/adapters/logger.ts`** — structured logger for the final summary line.

## Notes

- **Raw driver, not repositories.** `referencedFilenames` reads collections directly through `mongoose.connection.db.collection(...)`. This is the same constraint `image.worker.ts` is under: the script must reach every collection generically and cannot depend on any single module's repository interface.
- **`pruneUnreferenced` is flat.** It only deletes files *directly* under the directory it is given. Subdirectories (`images/seed/`, `images/system/`, `thumbs/` subfolders) are left untouched, matching the carve-out in `.gitignore`'s `public/images/*` rule.
- **Basename matching, not path matching.** The keep-set contains bare filenames (with extension). A promoted URL and the on-disk file share only their basename, so the comparison is intentionally path-agnostic.
- **No per-module coupling.** Because `resolveImageTargets(enabledModules)` drives the collection list, a new module that stores images needs zero changes in this script.
