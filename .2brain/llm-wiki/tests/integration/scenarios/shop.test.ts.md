---
source: tests/integration/scenarios/shop.test.ts
sha256: b924e934eb80768d1ed840cd9f118a41cfcfb5850c20d3e6905842f1a0006798
generated_at: 2026-09-27T15:58:25.734837+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/shop.test.ts

## Purpose

Integration test that builds the `shop` scenario end-to-end through the real application (checkout, payment, shipping, refund, admin endpoints) and then verifies four invariants: (1) the subject map exactly matches every module's declared guarantees, (2) each subject id resolves to an existing row, (3) each row carries the property its name claims *as the consumer sees it*, and (4) a produced row, when serialized for the wire, satisfies the API's own response schema. It exists so these behavioural contracts are enforced in `npm test` rather than left to a build step.

## Key elements

- **`beforeAll(connect)` / `afterAll(disconnect)`** — uses raw Mongoose connection instead of `setupTestDb()` because the database *is* the test subject; rebuilding it per-test would be both slow and meaningless.
- **`BUILD_TIMEOUT_MS = 300_000`** — single build in a second `beforeAll`; covers ~12 bcrypt-12 logins and hundreds of HTTP round-trips.
- **`wireShape<T>(value)`** — JSON round-trip to convert `Date`/`ObjectId` into the ISO/hex strings a real HTTP response would carry, before schema validation.
- **`subjects: Readonly<Record<string, string>>`** — the guarantee-name → row-id map returned by `buildScenario('shop', app)`; every subsequent test reads rows through it.
- **`createApp()` + `buildScenario('shop', app)`** — the same code path used by `npm run demo` and `scenario:apply`; this test exercises it directly.
- **`assertScenarioGuarantees('shop', subjects)`** — bidirectional check (no missing, no extra) against what all modules collectively declare.
- **Per-subject `it` / `it.each` blocks** — assert concrete row state: `deletedAt`, `active`, `available` (via `toProduct`), order `status`, reservation `held`, payment `method`/`status`, audit-log timestamp drift, stock-movement ledger reconciliation.

## Relationships

- **`scenarios/index.ts`** → `buildScenario`: the function under test; this file is its primary integration consumer.
- **`scenarios/check.ts`** → `assertScenarioGuarantees`: validates the subject map is a bijection against declared guarantees.
- **`scenarios/accounts.ts`** → `SEED_ADMIN_ID`, `SEED_USER_ID`: used to assert which account owns specific orders.
- **`src/app.ts`** → `createApp`: constructs the full Express app with all modules registered; the scenario drives this app over HTTP.
- **`src/modules/products/model.ts`** → `productModel`, `toProduct`: row lookups and the consumer-facing mapping used to verify `available`.
- **`src/modules/orders/model.ts`** → `orderModel`: order row assertions (status, `userId`, `deletedAt`, `paymentMethod`).
- **`src/modules/orders/index.ts`** → `orderService`: exercised transitively during the scenario build (checkout flow).
- **`src/modules/payments/model.ts`** → `paymentModel`: verifies payment method, status, and refund state.
- **`src/modules/users/model.ts`** → `userModel`: user rows created during the scenario.
- **`src/modules/audit-logs/model.ts`** → `auditLogModel`: confirms audit entries align with order timestamps and target ids.
- **`src/modules/addresses/model.ts`** → `addressBookModel`: address-book rows checked after PII decryption.
- **`src/modules/addresses/pii.ts`** → `decryptAddressItem`: applied before serializing address entries against the contract's `Address` schema.
- **`src/modules/inventory/model.ts`** → `reservationModel`, `stockMovementModel`: verifies stock holds exist and that `onHand` is reconcilable against the movement ledger.
- **`tests/support/database.ts`** → `connect`, `disconnect`: lifecycle management for this single-build-then-read pattern.

## Notes

- **`available` vs `onHand`**: the test deliberately asserts `toProduct(product).available === 0` (the derived counter the storefront reads) rather than `onHand === 0`; a product with stock entirely in reservations could have `onHand > 0` yet `available === 0`.
- **Locales are excluded from schema checks**: `scenarios/locales.ts` stores a shape no endpoint serves raw (the locale tier-merge builds the response), so validating a stored row against a response schema would be a false guardrail.
- **Address books are the exception**: they *are* checked, but only after `decryptAddressItem` — `applySerialization` alone never touches ciphertext, so the test mirrors what `addresses/repository.ts` readers do.
- **Temporal spread assertion**: orders must span >30 days back (not stacked at boot) but stay within `NODE_AUDIT_RETENTION_DAYS` (90), or the audit-trail screen would contradict the dataset.
- **The file is truncated in source**: the stock-movement reconciliation `it` block (checking `onHand` against summed `onHandDelta`) is present but cut off; the full file continues that reconciliation and the schema-validation `it` blocks.
