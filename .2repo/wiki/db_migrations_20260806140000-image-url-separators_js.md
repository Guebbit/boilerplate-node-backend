# db/migrations/20260806140000-image-url-separators.js

## Purpose

Repairs `imageUrl` strings stored with Windows backslash separators (`\images\x.jpg`) so they resolve as valid URL paths, and re-points six seed-fixture images to their new `/images/seed/` directory. It exists because multer's `file.path` (via `path.join()`) recorded upload URLs with the host's native separator, producing 404 URLs on any client.

## Key elements

- **`rewriteField(db, collection, field, match, mapper, arrayElement)`** — Reads distinct field values matching `match`, applies `mapper`, and issues targeted `updateMany` calls. Uses the read-then-write pattern (not an aggregation-pipeline update) to stay compatible with MongoDB 4.0. Accepts an optional `arrayElement` descriptor for dotted paths inside arrays.
- **`ORDER_ITEM_ELEMENT`** — Constant describing the `items` array element: path `items.$[item].product.imageUrl` and filter `item.product.imageUrl`, passed to `rewriteField` for the orders collection.
- **`toPosix(value)`** — Replaces every `\` with `/`.
- **`intoSeedDirectory(value)`** — If the filename is one of the six known seed fixtures, rewrites the directory to `/images/seed/`; otherwise returns the value unchanged.
- **`SEED_IMAGE_FILENAMES`** — A `Set` of the six hex-named fixture JPEGs referenced by `db/seeds/fixtures.ts`.
- **`module.exports.up(db)`** — Runs two passes per collection (products, users, orders): first `toPosix` (regex `\\\\` guard), then `intoSeedDirectory` (regex `^/images/[^/]+$` guard). Order matters: separator fix runs first so a `\images\<fixture>.jpg` row is normalised before the directory match.
- **`module.exports.down()`** — Intentionally empty; the migration is a one-way data repair with no faithful inverse.

## Relationships

No graph neighbors detected. The file references `db/seeds/fixtures.ts` only conceptually (the same six filenames are hard-coded here rather than imported).

## Notes

- **Idempotency is explicit, not structural.** Both passes use `$regex` guards in the match, so re-running is a no-op even though `migrate-mongo status` does not independently guarantee this.
- **`down()` is a no-op by design.** Rolling back past this migration leaves the corrected URLs in place; the old code reads them without issue.
- **Array-element writes use `arrayFilters` (MongoDB 3.6+).** A plain `$set` on `items.product.imageUrl` is rejected by the server because it cannot disambiguate which array element to target. The `arrayElement` parameter exists solely for the orders collection; products and users have a top-level `imageUrl`.
- **Seed-fixture rewrite matches by exact filename, not pattern.** A user upload at `/images/<hex>.jpg` that is *not* in the fixture set is left untouched.
- **Target floor is MongoDB 4.0.** No aggregation-pipeline update, no `$merge` — only `distinct` + `updateMany` with `arrayFilters`.
