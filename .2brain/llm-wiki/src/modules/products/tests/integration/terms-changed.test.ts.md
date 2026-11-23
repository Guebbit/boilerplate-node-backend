---
source: src/modules/products/tests/integration/terms-changed.test.ts
source_sha256: 45cb6f428e23d812a924c72a4137a8e9ae24291d4ab7a8c134c2b91988c53769
context_sha256: 2b28af66d3ff8d0d7d2bfcfb51778b3fadd2942b180111d388bd03a021206571
generated_at: 2026-11-22T07:18:16.962200+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/terms-changed.test.ts

## Purpose
Integration tests for the `product.terms_changed` event, which is written to the outbox in the same transaction as a product edit. The event is sent when a setting that decides availability changes, and on a restore. It is not sent for edits that leave those settings alone. Per the module doc, the `inventory` module listens for the event and deletes the product's cached availability.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `announced()`: helper that queries `outboxEventModel` for rows named `PRODUCT_TERMS_CHANGED` and returns their `aggregateId`s.
- `describe('... on an update')`:
  - Parameterised `it.each` checks that the event is sent when any of `active`, `purchasable`, `allowBackorder`, `releaseDate` or `restockDate` changes.
  - A second test checks that nothing is sent for an unrelated edit (`price`, `tags`).
  - A third test checks that nothing is sent when `active`/`purchasable` are written with the values they already have.
- `describe('... on a restore')`: soft-removes a product with `removeById(id, false)`, then calls `restoreById(id)` and expects the event to be announced once for that id.

## Relationships
- `@kernel/outbox` (`src/kernel/outbox.ts`): provides `outboxEventModel`, which is queried for the written events, and `settleOutboxNudges()`, which is awaited before each assertion.
- `../../events` (`src/modules/products/events.ts`): provides the `PRODUCT_TERMS_CHANGED` event name.
- `../../services` (`src/modules/products/services/index.ts`): exports `productService`, whose update, remove and restore operations are the ones under test.
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`): `createProduct` builds the fixtures.
- `@tests/callers` (`tests/support/callers.ts`): `callerContextAs('admin')` supplies the caller context for updates.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb` provides the database lifecycle.

## Notes
- Each test awaits `settleOutboxNudges()` before reading the outbox, so assertions run after the outbox has settled.
- The "no change" case writes the same values the product already has, so the event depends on a value actually moving, not on the field being present in the payload.
- Restore is called without a caller context, unlike the updates.
- Date changes use `'2999-01-05'`.
