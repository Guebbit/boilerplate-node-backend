---
source: src/modules/products/tests/integration/update-audit.test.ts
source_sha256: 3249ce961ca27da88251359ca15e1ce42154087fcab2ac35ec046c2f68b989f5
context_sha256: 5d17a73b9f8a7e589d8b92cae1ac7073ccbeea984813c0387210914e88ba24df
generated_at: 2026-11-22T07:18:44.156122+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/update-audit.test.ts

## Purpose
Integration test for the `ADMIN_PRODUCT_UPDATED` audit row written by `productService.updateById`. It checks that the row's metadata records `{ from, to }` for every non-text field that actually changed, and only the *names* of changed free-text fields (and the picture). That way a "lower, sell, restore" price sequence can be read from the audit trail rather than reconstructed from frozen order lines.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port wholesale with `auditPortMock()` from `@tests/ports`, rather than spying on it.
- `setupTestDb()` and `afterEach(() => jest.restoreAllMocks())`: database setup and mock cleanup.
- `updatedRowMetadata(spy)`: returns the `metadata` of the `ADMIN_PRODUCT_UPDATED` entry among the `emitAuditEvent` calls.
- Test cases, all calling `productService.updateById` as `callerContextAs('admin')`:
  - Money fields: `price`, `taxClass` and `rateType` each give `{ from, to }`.
  - Unset or cleared fields: only the side that exists is present (`taxClass: null` gives `{ from }`, a newly set `rateType` gives `{ to }`).
  - Rights, shipping and publishing: `active`, `purchasable`, `requiresShipping`, `noWithdrawal`, `weight`, `sku` and `categories` are recorded. `tags` is sent unchanged and is omitted.
  - Release date and title: `releaseDate` is recorded as `{ to: startOfShopDay(...).toISOString() }`. A changed title appears only as `changedFields: ['title']`, and the new title text must not appear in the serialized metadata.
  - Unchanged values: a `price` or `active` sent with its current value writes no `changes`. A rename alone yields `{ changedFields: ['title'] }`.

## Relationships
- `src/modules/products/services/index.ts`: supplies `productService`, the unit under test.
- `src/modules/products/audit.ts`: supplies `productsAuditActions`, whose `ADMIN_PRODUCT_UPDATED` value is used to pick out the relevant audit entry.
- `src/infrastructure/observability/audit.ts`: its `emitAuditEvent` is mocked and observed.
- `tests/support/ports.ts`: provides `auditPortMock` (for the module mock) and `observePort` (returns the spy on `emitAuditEvent`).
- `tests/support/callers.ts`: `callerContextAs('admin')` builds the caller context.
- `tests/support/setup-test-db.ts`: `setupTestDb` sets up the test database.
- `src/modules/products/tests/factories.ts`: `createProduct` seeds the initial product.
- `src/modules/shop/index.ts` (implemented in `service.ts`): `startOfShopDay` computes the expected `releaseDate` value.

## Notes
- The test file refers to `delete-restore-audit.test.ts` for why the audit port is replaced rather than spied on.
- The expected metadata uses `toEqual`, so a field that did not change must be absent from `changes`. It does not appear as an equal `{ from, to }` pair.
- The title test also asserts that the new text is absent from the serialized metadata, to check that free-text content is not copied into the audit row.
