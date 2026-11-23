---
source: src/modules/products/tests/contract/actions.contract.test.ts
source_sha256: 836189a542acf2be5fd0e2cd9ee905d0c0ff4dd6eefbdc944143edda4f9544e7
context_sha256: 44eedbbececcbd7727d0b1249280164404f52518d1b16cbaf09f5445a851e065
generated_at: 2026-11-22T07:14:51.501743+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/contract/actions.contract.test.ts

## Purpose
Contract tests for the `actions` flags that product endpoints return, which tell the caller which buttons it may press (`update`, `delete`, `restore`, `hardDelete`). They check that guests and customers always see every flag `false`, that staff see the real values (a deleted row offers restore instead of delete), and that a response cached for guests never leaks staff's flags.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `NOTHING`: the expected all-`false` actions object.
- `actionsOfRows(response)`: extracts the `actions` of every item in a list response.
- `GET /products — actions` suite:
  - A parameterised test checks that a guest and a `customer` get `[NOTHING]` with status 200.
  - Admin sees `{update, delete, hardDelete: true, restore: false}` on a live row and `{update, restore, hardDelete: true, delete: false}` on a soft-deleted row (`deletedAt` set).
  - A cache test has admin request the list first, then a guest request it, and expects the guest to still get `[NOTHING]`.
- `GET /products/{id} and the writes — actions` suite:
  - On the detail endpoint, a guest gets `NOTHING` and an admin gets the real flags.
  - `POST /products/{id}/restore` on a deleted product returns 200 with `actions` matching `{ delete: true, restore: false }`.

## Relationships
- `src/modules/products/tests/factories.ts`: `createProduct()` seeds live products and deleted ones (via `deletedAt`).
- `tests/support/http.ts`: provides `api()`, the HTTP client used for requests, and `authenticateAsRole(role)`, which returns a `bearer` token that is set as the `Authorization` header.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`, which sets up the database state for the tests.
- `tests/support/contract.ts`: imported for its side effects only (`import '@tests/contract'`) and nothing is used from it by name.

## Notes
- The cache test is order-dependent by design: staff must hit the endpoint first to warm the cache before the guest request.
- Customers are asserted all-`false` on the list endpoint on the premise that they are answered from the cache shared with guests. The detail and restore tests only cover admin and guest.
