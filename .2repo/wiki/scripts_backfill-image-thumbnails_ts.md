# scripts/backfill-image-thumbnails.ts

## Purpose
One-off backfill script (`npm run backfill:image-thumbnails`) that generates `thumbnailUrl` for product and user images uploaded before the digest pipeline shipped (pre-pipeline rows and `public/images/seed/` fixtures). Idempotent: the query excludes documents that already have a `thumbnailUrl`, so re-runs only touch missed or failed rows.

## Key elements
- **`UNTHUMBNAILED_LOCAL_IMAGE`** — Mongoose `QueryFilter` matching local `/images/` paths that lack (or have empty) `thumbnailUrl`.
- **`backfillOne(document, save)`** — Generic helper: reads the original via `imageStore.readImage`, produces a thumbnail with `thumbnailImage`, writes the derivative via `imageStore.putDerivative`, sets `document.thumbnailUrl`, then calls the supplied `save`.
- **`backfillProducts()`** — Queries `productRepository.findAll` with the filter, then sequentially re-fetches each `_id` via `findById` and calls `backfillOne`. Per-row failures are logged and skipped.
- **`backfillUsers()`** — Same pattern against `userRepository`.
- **`main()`** — Calls `start()` (DB connect), runs both backfills, and is wrapped by `runScript(main, () => stopDatabase())` for clean shutdown.

## Relationships
- **`db/run-script.ts`** — `runScript` provides the CLI lifecycle wrapper (invokes `main`, ensures `stopDatabase` cleanup on exit/error).
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.readImage` fetches the source bytes; `imageStore.putDerivative` persists the generated thumbnail and returns its URL.
- **`src/infrastructure/adapters/image.ts`** — `thumbnailImage` performs the actual Sharp/libvips resize.
- **`src/infrastructure/adapters/logger.ts`** — Structured `logger` for progress and per-row error messages.
- **`src/infrastructure/runtime/database.ts`** — `start` connects the Mongoose client; `stopDatabase` is the cleanup callback.
- **`src/modules/products/repository.ts`** — `productRepository.findAll`, `.findById`, `.save` (the script never touches the Mongoose model directly).
- **`src/modules/products/model.ts`** — `ProductDocument` type used to cast the shared filter.
- **`src/modules/users/index.ts`** — Canonical export point for `userRepository` and `UserDocument`; the script imports from here per the module-encapsulation rule stated in that file.
- **`src/modules/users/repository.ts`** — `userRepository` methods (`findAll`, `findById`, `save`).
- **`src/modules/users/model.ts`** — `UserDocument` type used in the filter cast.

## Notes
- **Sequential by design.** `sharp.concurrency(1)` in `adapters/image.ts` caps libvips to one thread; parallelising the loop would only add queueing, not throughput.
- **Lean-row re-fetch.** `findAll` returns lean (non-hydrated) rows, so each `_id` is re-fetched with `findById` to get a document with a working `.save()`. This is an intentional extra read to stay within repository boundaries.
- **Local paths only.** The regex `^/images/` skips remote or default URLs that have no local bytes to thumbnail.
- **Encapsulation rule.** The script deliberately goes through `productRepository` / `userRepository` rather than importing the raw Mongoose models, consistent with the rule in `src/modules/users/index.ts`.
