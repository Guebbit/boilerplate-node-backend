# src/modules/wishlist/index.ts

## Purpose

Public barrel for the wishlist module. It enforces a single import surface for sibling modules: consumers import `wishlistService` from here rather than reaching into individual functions in `service.ts` directly. The file exists to make the module's public API explicit and stable.

## Key elements

- **`wishlistService`** (re-export from `./service`) — the sole public export. Represents the entire curated wishlist surface a caller may use, so adding or reshaping internals doesn't ripple into consumers.

## Relationships

- **`src/modules/wishlist/service.ts`** — the implementation source; this barrel re-exports `wishlistService` from it.
- **`src/modules/account/services/export.ts`** — downstream consumer that imports from this barrel (the sanctioned entry point) rather than from `service.ts` directly.

## Notes

- The module's import rule (siblings import the barrel, never the internal file) is mirrored from `src/modules/products/index.ts`. Keep both barrels in sync if the convention changes.
- Adding a second `export …` line here is the intended way to grow the public API; do **not** let callers bypass this file and import `./service` paths directly.
- Detailed domain docs live in `docs/modules/wishlist.md` (referenced in the file header).
