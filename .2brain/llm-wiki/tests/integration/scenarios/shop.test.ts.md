---
source: tests/integration/scenarios/shop.test.ts
sha256: ff908e47ef60856fd29e3f6dfd16c616f36bf5a4d33609d0d381f0fefca5b5aa
generated_at: 2026-10-29T07:02:41.061407+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/shop.test.ts

## Purpose

Integration test that builds the full "shop" scenario through the real application (checkout, payment, shipping, refund, admin endpoints) and then validates four guarantees: bidirectional completeness of every module's declared subjects, existence of each referenced row, correctness of each row's property *where the consumer reads it* (e.g. `available` via `presentProduct`, not raw `onHand`), and schema-validity of produced rows against the API's own response types. It is the only test in the repo that treats the database as the subject under test, building once and reading the result in every case.

## Key elements

- **`beforeAll(connect)` / `afterAll(disconnect + emptyFileSandbox)`** — Manual DB lifecycle; deliberately bypasses `setupTestDb` because the suite builds once and reads many times.
- **`BUILD_TIMEOUT_MS = 300_000`** — One-time build timeout; covers ~12 password-hash logins and several hundred HTTP round-trips.
- **`subjects: Readonly<Record<string, string>>`** — The guarantee-name → row-id map produced by `buildScenario('shop', app)`.
- **`wireShape<T>(value)`** — `JSON.parse(JSON.stringify(value))` round-trip that converts Mongoose `Date`/`ObjectId` instances to the ISO/hex strings Express would put on the wire; used before Zod-schema validation.
- **`createApp()`** — Registers every enabled module (including `products` translatables) so `buildScenario` exercises the real middleware stack.
- **`describe("the shop scenario's guarantees")`** — Calls `assertScenarioGuarantees('shop', subjects)` to verify bidirectional completeness.
- **`describe('each subject names a row that really has the property')`** — Per-product persona assertions (softDeleted, inactive, offSale, outOfStock, barebones, inStock, rich, digital, lowStock, noWithdrawal, heavy), catalogue VAT/shipping/digital counts, persona and staff account state checks, and (in the truncated portion) order/payment/delivery/audit-log/address-book/2FA-backup-code reads.

## Relationships

- **`scenarios/index.ts`** — Exports `buildScenario`, the function this test calls to drive the entire shop flow through the live app.
- **`scenarios/check.ts`** — Exports `assertScenarioGuarantees`, used for the bidirectional subject-completeness assertion.
- **`scenarios/accounts.ts`** — Supplies `seedCredentials` (email/password for each persona) and the `SEED_*_ID` / `SEED_TWO_FACTOR_BACKUP_CODES` constants the account assertions compare against.
- **`scenarios/users.ts`** — Exports `SEED_CUSTOMER_IDS` for customer-side assertions.
- **`src/app.ts`** — `createApp` builds the Express instance with all module routes, middleware, and serializers that `buildScenario` drives.
- **`src/modules/orders/model.ts` / `src/modules/orders/index.ts`** — `orderModel` and `orderService` are imported to read back created orders and verify their shape.
- **`src/modules/payments/model.ts`** — `paymentModel` for asserting payment rows produced by the checkout flow.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel` and `shipmentModel` for shipping/fulfilment row checks.
- **`src/modules/audit-logs/model.ts`** — `auditLogModel` to verify audit entries the scenario writes.
- **`src/modules/addresses/model.ts` + `src/modules/addresses/pii.ts`** — `addressBookModel` and `decryptAddressItem`; the test reads address-book rows the same way the repository's own readers do (decrypt then serialize) before validating against the `Address` response schema.
- **`src/modules/inventory/model.ts`** — `reservationModel` and `stockMovementModel` for reservation and stock-movement row assertions.
- **`src/modules/account/two-factor/backup-codes.ts`** — `hashBackupCode` to verify that the seeded 2FA backup codes hash-match what the module stores.

## Notes

- This suite is the **only** one that calls `connect`/`disconnect` directly. `setupTestDb` (used elsewhere) truncates the DB before every `it()`, which would destroy the single build this file depends on.
- `wireShape` exists because Mongoose's `toJSON()` leaves `Date` and `ObjectId` as live JS instances; without the round-trip, Zod schema parsing would see the wrong types. The `structuredClone` ESLint disable is intentional — `structuredClone` preserves those types.
- Stock checks use `presentProduct(product).available` (the derived, reservation-aware counter the storefront actually reads) rather than the raw `onHand` column. An out-of-stock guarantee is only meaningful at the consumer's read point.
- The build uploads a product image through the real file-upload route; `emptyFileSandbox` in `afterAll` is the only cleanup mechanism for that artifact.
- `products.seed()` writes `translations` through the same write path as `productService.create`, so no manual translatable-lookup wiring is needed here — `createApp()` already registers the module's `translatables` declaration.
