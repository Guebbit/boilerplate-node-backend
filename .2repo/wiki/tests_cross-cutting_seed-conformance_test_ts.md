# tests/cross-cutting/seed-conformance.test.ts

## Purpose

Validates that `db/demo/demo-data.json` conforms to the generated Zod schemas (derived from `openapi.yaml`). It is the backend mirror of `tests/cross-cutting/seedConformance.spec.ts` in the paired frontend repo, closing the drift direction where a field rename in `openapi.yaml` was previously silent—seeders kept writing the old name and nothing compared the output to the contract.

## Key elements

- **`productSchema`** — `GetProductByIdResponse.shape.data` with a `.required()` mask (onHand, reserved, available, description, active, imageUrl, categories, tags) and `.strict()`.
- **`userSchema`** — `GetUserByIdResponse.shape.data` with `.required({ admin, active, imageUrl })` and `.strict()`.
- **`orderSchema`** — `GetOrderByIdResponse.shape.data.strict()` (all fields already non-optional on the wire).
- **`cartItemSchema`** — single cart line item from `GetCartResponse`, `.strict()`.
- **`addressSchema`** — one address-book entry from `GetAddressesResponse`, `.strict()`.
- **`wishlistProductIdSchema`** — the `productId` sub-schema from `GetWishlistResponse`.
- **`languageSchema` / `localeEntrySchema`** — from the CREATE responses; `.required({ createdAt, updatedAt })` + `.strict()`.
- **`idSchema`** — the `id` field from `GetUserByIdResponse`, used for cross-referencing.
- **`describe` blocks** — one per collection (products, users, credentials, orders, addressBooks, carts, wishlists, languages, localeEntries), each asserting schema conformance plus invariants (e.g. exactly one soft-deleted product, one admin, one default address per book, credential passwords pass `CreateUserBody.shape.password`).

## Relationships

- **`db/demo/demo-data.json`** — the sole data input; the test destructures `_meta`, `credentials`, and `collections` from it and runs every assertion against those rows.
- **`src/infrastructure/i18n/index.ts`** — barrel export that re-exports `listSupportedLocales` from `catalog.ts`; imported here to validate the dynamic-locale collections against the set of supported locales the API actually ships.
- **`src/infrastructure/i18n/catalog.ts`** — provides the `listSupportedLocales` implementation that the locale-collection tests call.

## Notes

- **`.strict()` is load-bearing.** Without it, a renamed field passes silently: the stale key is stripped as unknown and the new key is absent-but-optional. `.strict()` catches the stale key; `.required()` masks catch the missing one.
- **`.required()` masks encode a "complete specimen" promise.** Every field in a mask is read downstream with no `?? fallback`; if a seeded row lacks one, the paired frontend's mocks break.
- **Byte-identical to the frontend copy.** A separate `check:spec-identity` job compares the two `demo-data.json` files to each other; this file compares either copy to the contract. Neither check is redundant.
- **`deletedAt` is intentionally optional throughout** — present on exactly one product and one order by design (to exercise the soft-delete branch of `publicScope()`).
- **Order totals are recomputed from line items** in the test, not trusted from the JSON. This catches a disagreement between `applyOrderTransform` and its own inputs before it propagates into the frontend's mocks.
- **Credentials are validated against `CreateUserBody.shape.password`** — the real signup policy—so a published credential the API would reject is caught here.
