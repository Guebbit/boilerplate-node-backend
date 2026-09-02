# tests/cross-cutting/seed-conformance.test.ts

## Purpose

Validates that the exported demo dataset (`db/demo/demo-data.json`) still conforms to the OpenAPI-generated Zod schemas. It exists to close a drift gap: renaming a field in `openapi.yaml` is silent for the seeders (no compile error), so without this check the dataset could silently diverge from the contract. It is a deliberate mirror of the paired frontend's `seedConformance.spec.ts`; a companion job (`check:spec-identity`) only compares the two file copies to each other, not either to `openapi.yaml`.

## Key elements

- **`productSchema`** — `GetProductByIdResponse.shape.data` with `.required({ onHand, reserved, available, description, active, imageUrl, categories, tags })` and `.strict()`. Catches missing stock/derived fields and unknown keys.
- **`userSchema`** — `GetUserByIdResponse.shape.data` with `.required({ admin, active, imageUrl })` and `.strict()`.
- **`orderSchema`** — `GetOrderByIdResponse.shape.data.strict()`. No `.required()` mask; totals are verified separately by arithmetic recompute.
- **`cartItemSchema`** — `GetCartResponse` item element, `.strict()`.
- **`addressSchema`** — `GetAddressesResponse` array element, `.strict()`. Catches `_id` vs `id` drift.
- **`languageSchema` / `localeEntrySchema`** — `CreateLocaleResponse` / `CreateLocaleEntryResponse` `.data` with `.required({ createdAt, updatedAt })` and `.strict()`.
- **`wishlistProductIdSchema`** — bare Zod schema for `GetWishlistResponse` item's `productId`.
- **Test suites** — `products`, `users`, `credentials`, `orders`, `address books`. Each asserts schema parse + structural invariants (exactly one soft-deleted product/order, one admin user, no leaked passwords/tokens, order totals match line-item arithmetic, one default address per book, credentials pass the real signup password policy, locale entries match `listSupportedLocales`).

## Relationships

- **`db/demo/demo-data.json`** — the dataset under test; destructured into `_meta`, `credentials`, and `collections`. This file is its sole consumer in the backend repo.
- **`src/infrastructure/i18n/index.ts`** — re-exported as `@infrastructure/i18n`; this test imports `listSupportedLocales` from it to assert the locale collection covers exactly the supported set.
- **`src/infrastructure/i18n/catalog.ts`** — implementation behind the `index.ts` barrel; defines the locale data the test cross-checks against `collections.locales` and `collections.localeEntries`.

## Notes

- `.strict()` is load-bearing. Orval emits plain `zod.object()` (no `strict`) even when `openapi.yaml` says `additionalProperties: false`. Without it, a renamed field would be silently stripped as unknown while the new optional key simply stays absent — both directions of a rename pass.
- `.required()` masks convert the wire type's permissive optionality into a "seeded row is a complete specimen" guarantee. Omitting a required mask means the row parses green even if the transform that populates the field stopped running.
- `deletedAt` is intentionally left optional everywhere: it is present on exactly one product and one order by design (to exercise `publicScope()` branches).
- Order total assertions recompute `totalItems`, `totalQuantity`, and `totalPrice` (including `shippingCost ?? 0`) from `items[]`. This is the one place the arithmetic is restated on purpose — it catches `applyOrderTransform` disagreeing with its own inputs.
- The credentials block validates passwords against `CreateUserBody.shape.password`, i.e. the *actual* signup policy, not a local copy.
- The file's header documents that it replaced an earlier version that parsed `seed-identities.ts` (hand-written facts) and required `.extend()`/`.pick()` surgery on schemas. Now the dataset holds what the API actually returned, so schemas are used as-generated.
