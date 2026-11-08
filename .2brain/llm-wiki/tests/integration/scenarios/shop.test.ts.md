---
source: tests/integration/scenarios/shop.test.ts
sha256: 0b452acc91b0772cb61fd9b6d1a39dcacc972f0e84b302169201b2e412671dac
generated_at: 2026-11-08T09:47:42.887375+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/shop.test.ts

## Purpose

Integration test that runs the full `buildScenario('shop')` pipeline (the same call used by `npm run demo` and `scenario:apply`) once against a live database, then validates four contract-level claims: (1) the guarantee map is bidirectionally consistent, (2) every subject id resolves to a real row, (3) each row carries the property its name implies *where the consumer reads it*, and (4) a produced row, in wire shape, satisfies the API's own response schema.

## Key elements

- **`wireShape<T>(value)`** — JSON round-trip helper that converts `Date`/`ObjectId` to their wire strings, replicating Express's `JSON.stringify` without going over HTTP.
- **`subjects`** — module-level `Readonly<Record<string, string>>` map (guarantee name → row id) populated by the single `buildScenario` call.
- **`BUILD_TIMEOUT_MS` (300 000)** — timeout for the one-time build; far above suite default due to 12 password-hash logins and several hundred middleware-stack round trips.
- **`beforeAll(connect)` / `afterAll(disconnect + emptyFileSandbox)`** — lifecycle. The file sandbox is cleaned because the build uploads a product image through the real route.
- **`describe("the shop scenario's guarantees")`** — calls `assertScenarioGuarantees('shop', subjects)` to verify bidirectional consistency between declared guarantees and produced rows.
- **`describe('each subject names a row that really has the property')`** — a series of `it()` blocks that fetch individual rows by id and assert the semantic property (e.g. `product.outOfStock` has `presentProduct(p).available === 0` while remaining active/undeleted; `product.heavy` weighs > 5000 g but ≤ 30 000 g; staff accounts are active & verified).
- **Catalogue aggregate checks** — `countDocuments` queries asserting reduced/zero/exempt VAT classes exist, > 100 weighted products, and ≥ 3 non-shipping (digital) products.
- **`createApp()`** — instantiated once at module scope; registers all enabled modules so `buildScenario` can use the real service/presenter layer.

## Relationships

- **`scenarios/index.ts`** — provides `buildScenario`, the seeding entry point this test drives.
- **`scenarios/check.ts`** — provides `assertScenarioGuarantees`, the bidirectional guarantee validator.
- **`scenarios/accounts.ts`** — supplies all seeded user ids (`SEED_ADMIN_ID`, `SEED_USER_ID`, etc.) and `seedCredentials` used to locate persona rows.
- **`scenarios/users.ts`** — supplies `SEED_CUSTOMER_IDS` for customer-row assertions.
- **`src/app.ts`** — `createApp` builds the full application (all modules, middleware, routes) that `buildScenario` exercises.
- **`src/modules/products/model.ts` / `presenter.ts`** — `productModel` for row fetches; `presentProduct` to read `available` exactly as the storefront does.
- **`src/modules/orders/model.ts` / `services/index.ts`** — `orderModel` and `orderService` used in order-related row checks.
- **`src/modules/payments/model.ts`** — `paymentModel` for payment-row assertions.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel`, `shipmentModel` for shipping-row checks.
- **`src/modules/inventory/model.ts`** — `reservationModel`, `stockMovementModel` for stock-level assertions.
- **`src/modules/addresses/model.ts` / `pii.ts`** — `addressBookModel` for row fetches; `decryptAddressItem` to reproduce the repository's read path before schema-checking the wire shape.
- **`src/modules/audit-logs/model.ts`** — `auditLogModel` for audit-entry row checks.
- **`src/modules/account/two-factor/backup-codes.ts`** — `hashBackupCode` to verify backup-code rows are correctly hashed.

## Notes

- **Only suite using `connect`/`disconnect`** rather than `setupTestDb`. `setupTestDb` wipes the database before every `it()`; here the database *is* the subject, so the build runs exactly once and all cases read the shared state.
- **`wireShape` exists because** Mongoose `toJSON()` preserves `Date` and `ObjectId` as live instances; only `JSON.stringify` (as Express does) converts them to wire strings. `structuredClone` would keep them live, so it is explicitly avoided.
- **`available` vs `onHand`**: stock assertions go through `presentProduct(...).available` (the derived counter the storefront badge reads), not the raw `onHand` field, because a row held entirely in reservations can have `onHand > 0` but `available === 0`.
- **Locales are intentionally NOT schema-checked**: `scenarios/locales.ts` publishes a stored shape with no raw-serving endpoint; the locale tier-merge builds the response, so parsing a stored row against the response schema would be a false guardrail.
- **Address books are the exception**: despite being a stored shape, they are schema-checked because `decryptAddressItem` (the same function `addresses/repository.ts` readers use) makes the decrypted entry serialize identically to the contract's `Address` response.
