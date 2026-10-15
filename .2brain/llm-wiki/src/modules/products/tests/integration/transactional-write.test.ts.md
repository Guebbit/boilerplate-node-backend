---
source: src/modules/products/tests/integration/transactional-write.test.ts
sha256: 75484a5dc2f14ca17233755defefcbcbbbd18ee1b42e9b24d8a7e99102887fe2
generated_at: 2026-10-15T11:49:33.555324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/transactional-write.test.ts

## Purpose

Integration test proving that a product write and its translation rows are a single transaction: either the product, its translations, and the outbox event all commit, or none do. It also asserts the outbox event is part of the same commit. Uses a real Mongo instance for the product store, but a double for the translation port whose `write` can be made to fail mid-flight.

## Key elements

- **`write` (jest.Mock)** — Swappable mock standing in for the translation port's `write`. Each test calls `mockRejectedValueOnce` to simulate a translation-store failure.
- **`beforeEach`** — Registers a full translation-port double via `registerTranslationPort`; the only non-trivial member is `plan`, which returns a single upsert for the `en` fallback locale.
- **`afterEach`** — Calls `registerTranslationPort(undefined)` to clean up.
- **`rowsNamed(name)`** — Helper that queries `outboxEventModel` for rows matching a given event name.
- **`describe('productService.writeCreate is one transaction')`** — Two tests: (1) rollback — no product row and no `product.created` outbox row when translation `write` rejects; (2) happy path — product, one translation write, and one outbox row all commit together.
- **`describe('productService.writeUpdate is one transaction')`** — One test: when translation `write` rejects, the pre-existing product row is unchanged.
- **`FALLBACK`** — Hardcoded `'en'`, the fallback locale in every environment this suite targets.

## Relationships

- **`@tests/setup-test-db`** — `setupTestDb()` initialises a real in-process Mongo; all repository assertions hit this instance.
- **`@tests/callers`** — Provides `testCallerContext`, the caller argument passed to every service call.
- **`@kernel/outbox`** — `outboxEventModel` is queried directly to assert event rows; `settleOutboxNudges()` flushes async nudge timers before assertions.
- **`@kernel/translation`** — `registerTranslationPort` is used to inject the test double (and later unset it).
- **`@modules/products/services`** — `productService` is the system under test; tests call `writeCreate` and `writeUpdate`.
- **`@modules/products/repository`** — `productRepository.count` and factory helpers read/write the real Mongo to verify post-transaction state.
- **`@modules/products/tests/factories`** — `createProduct` seeds a product; `readProduct` retrieves it for assertions.
- **`@modules/products/model`** — `ProductDocument` type used to cast the service result.
- **`@infrastructure/http/response`** — `ResponseSuccess` type for typing the successful service return.

## Notes

- This is a **hybrid** integration test: the product store is real Mongo, but the translation store is entirely a mock. Do not expect it to exercise the actual translation repository or network I/O.
- `settleOutboxNudges()` must be awaited **before** asserting on outbox rows; omitting it can yield flaky "row not yet visible" failures.
- The `write` mock is module-scoped (`let`), not a per-test local. Tests rely on `mockRejectedValueOnce` so subsequent calls in the same test (if any) would succeed — reset happens implicitly via the fresh `jest.fn` in `beforeEach`.
- `en` is assumed to be the fallback locale in **every** environment this suite runs in; if that invariant breaks, the `plan` double and all assertions keyed on `[FALLBACK]` will be wrong.
