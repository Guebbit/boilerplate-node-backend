---
source: src/modules/products/tests/integration/transactional-write.test.ts
source_sha256: 85341a4cd1a595288a9cd9acf0cdfc77f547b5cfb3b5fbf14bfaa15355f29f0c
context_sha256: 63e1128c91309ff0e8e8cc1de7060b87fdd3bded75eac94b342a6433d4ff110f
generated_at: 2026-11-22T07:18:29.685845+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/transactional-write.test.ts

## Purpose
Integration test (real Mongo) verifying that a product write and its translation rows commit atomically, and that the event the write announces is stored through the transactional outbox. The translation port is replaced by a double whose `write` can be made to fail, simulating a locales store dying mid-write.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `FALLBACK` — constant `'en'`, the fallback locale used in the port's `plan` result and in translation payloads.
- `write` (`jest.Mock`) — the translation port's `write`, reassigned in `beforeEach` and made to reject per test.
- `beforeEach` / `afterEach` — register a full translation port double via `registerTranslationPort`, then unregister it (`undefined`) after each test.
- `rowsNamed(name)` — helper that queries `outboxEventModel` for outbox rows by event name.
- `productService.create is one transaction` — covers two cases:
  - A failing translation write leaves no product and no `product.created` outbox row.
  - A successful create commits the product, calls `write` once, and stores exactly one `product.created` row whose `aggregateId` and `payload.productId` match the new product id.
- `productService.create after its commit` — if the post-commit `productRepository.findById` re-read rejects, `create` still returns a successful result and the product persists.
- `productService.updateById is one transaction` — when the translation write fails, the existing product keeps its old `price` and `active` values.

## Relationships
- `@kernel/translation` — `registerTranslationPort` installs the test double.
- `@kernel/outbox` — `outboxEventModel` is queried directly; `settleOutboxNudges` is awaited after a successful create.
- `../../services` (`productService`) — the system under test (`create`, `updateById`, `zodProductCreateSchema`).
- `../../repository` (`productRepository`) — used for `count({})` assertions and spied on (`findById`) to simulate a re-read failure.
- `@modules/products/tests/factories` — `createProduct` seeds a product and `readProduct` reads it back for the update test.
- `@tests/setup-test-db` and `@tests/callers` — DB setup, and caller contexts (`testCallerContext`, `callerContextAs('admin')`).
- `@infrastructure/http/response` (`ResponseSuccess`) and `../../model` (`ProductDocument`) — types only, used to type the `create` result.

## Notes
- The re-read test calls `jest.restoreAllMocks()` at its end, not in `afterEach`, so a failure before that line would leave the `findById` spy in place.
- The `findById` mock is `mockRejectedValueOnce`, so it affects only the first call.
- `updateById` is passed a plain object rather than going through `zodProductCreateSchema.parse`.
