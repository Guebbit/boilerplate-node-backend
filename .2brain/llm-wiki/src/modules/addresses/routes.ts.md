---
source: src/modules/addresses/routes.ts
sha256: 5c7e2c36c70ef361a23e20e69c7fb4f953f254af0a513375906f8a865cac0084
generated_at: 2026-11-14T19:19:36.775510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose

Defines the Express router for the address-book endpoints, mounted at `/account` alongside the account module's own router (see `./module.ts`). It wires the six controller functions to their HTTP verbs and paths, applying auth, cache, and idempotency middleware in the correct order for each route.

## Key elements

- **`router`** (exported) — The `express.Router` instance. Applied globally: `getAuth` (resolves the session context, idempotent), then `noStore` (forbids caching on all responses). Each route additionally guards with `isAuth`.
- **Route table**
  - `GET /addresses` → `getAddresses` — list the caller's book.
  - `POST /addresses` → `idempotencyKey` → `postAddress` — add an entry; the idempotency key replays a retry instead of creating a duplicate and consuming a slot in the book's capacity cap.
  - `GET /addresses/:addressId` → `getAddress` — fetch a single entry.
  - `PUT /addresses/:addressId` → `replaceAddress` — full-replace the entry.
  - `PATCH /addresses/:addressId` → `updateAddress` — partial merge of supplied fields.
  - `PUT /addresses/:addressId/default` → `putAddressDefault` — set the book-level default pointer (modeled as its own action, not a field on the address).
  - `DELETE /addresses/:addressId` → `deleteAddress` — remove an entry.

## Relationships

- **`src/modules/addresses/module.ts`** — imports and mounts `router` under the `/account` prefix.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth` (session resolution, safe to apply repeatedly) and `isAuth` (per-route guard that rejects unauthenticated requests).
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`, applied globally to prevent any caching of identity-adjacent responses.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`, applied only on the `POST` route to deduplicate retries.
- **`src/modules/addresses/controllers/*.ts`** — each controller file exports the single handler referenced by its route. `update-address.ts` exports both `replaceAddress` (PUT) and `updateAddress` (PATCH).
- **`src/modules/addresses/tests/unit/routes.test.ts`** — unit-tests for the route wiring and middleware ordering.

## Notes

- `replaceAddress` (PUT) and `updateAddress` (PATCH) live in the same controller file (`update-address.ts`) but are semantically distinct: full-replace vs. partial merge.
- The default-address route (`PUT …/default`) is deliberately a separate endpoint rather than a `PATCH` field, because the default pointer belongs to the book, not to an individual address.
- `idempotencyKey` is intentionally placed **after** `isAuth` so that an unauthenticated retry is rejected before an idempotency slot is consumed.
- The file's doc-block explains that `getAuth` is applied here *in addition to* the kernel-level middleware; it short-circuits when a context is already resolved, so the cost is negligible.
