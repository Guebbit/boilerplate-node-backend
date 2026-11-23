---
source: src/modules/products/tests/contract/stock-visibility.contract.test.ts
source_sha256: 4aee9fe94864aaa1f619fa7bfca9f935e681a9b2a49d01d8eab1b0c942bf69ea
context_sha256: 44eedbbececcbd7727d0b1249280164404f52518d1b16cbaf09f5445a851e065
generated_at: 2026-11-22T07:15:08.835000+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/contract/stock-visibility.contract.test.ts

## Purpose
Contract test asserting that the product HTTP answer (detail and list) carries no stock information for any caller. Stock is owned by the `inventory` module (`/products/{id}/availability` for shoppers, `/inventory/levels/{id}` for stock readers), so the product answer must be identical across roles except for role-specific views: `actions` and `translations`.

## Key elements
- `STOCK_FIELDS` – the eight stock-shaped fields that must be absent: `onHand`, `reserved`, `available`, `inStock`, `lowStock`, `buyable`, `preorder`, `backorder`.
- `dataOf(response)` – casts a response body to a plain record.
- `withoutRoleViews(obj)` – strips `actions` and `translations` so answers can be compared across roles.
- `ROLES` – table of `[label, role]` pairs: guest (`undefined`), customer, unverified, editor (has product keys but not the stock key), manager, warehouse, admin.
- `readAs(path, role)` – issues `GET path` via `api()`, adding a bearer from `authenticateAsRole(role)` unless the role is `undefined` (guest).
- `GET /products/{id}` tests:
  - For every role, status is 200 and none of `STOCK_FIELDS` appear in the body.
  - A manager's answer equals a guest's after `withoutRoleViews`.
- `GET /products` test: for every role, status is 200, the list has exactly 2 `items` (one product with `onHand: 12`, one with `0`), and no row contains a stock field.

## Relationships
- `@modules/products/tests/factories` (`factories.ts`) – `createProduct({ onHand })` seeds the products read back.
- `@tests/contract` (`tests/support/contract.ts`) – imported for its side effects to set up the contract-test environment.
- `@tests/http` (`tests/support/http.ts`) – supplies `api()` (request builder) and `authenticateAsRole()` (bearer token for a role).
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`) – `setupTestDb()` is called at module level to provision the test database.

## Notes
- The module doc points to `tests/contract/product-write.test.ts` for product writes, which already sets up the locales those need.
- The test passes `onHand` to `createProduct` even though the answer must not expose it, so the seed holds stock that the answer is expected to leave out.
- `unverified` and the `editor` role are included deliberately to cover callers with different permission sets.
