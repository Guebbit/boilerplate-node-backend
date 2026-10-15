---
source: tests/integration/scenarios/shop.test.ts
sha256: 8bc6b2f2e7d60f68443b604117a05697ee328c7cd6e286f5677886cec33aa0fd
generated_at: 2026-10-15T12:53:27.005553+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/shop.test.ts

## Purpose

Integration test that builds the full "shop" scenario through the real application (`createApp` + `buildScenario`) and then verifies, against the resulting database rows, that every guarantee each module declares actually holds. It is the only test in the repo that drives the application's own checkout, payment, shipping, refund, and admin endpoints during the build phase, making it the canonical end-to-end proof that the seed is internally consistent.

## Key elements

- **`beforeAll(connect)` / `afterAll(disconnect + emptyFileSandbox)`** — Uses raw `connect`/`disconnect` instead of `setupTestDb` because the database *is* the subject; rebuilding it per-test would be wasteful and pointless.
- **`beforeAll → buildScenario('shop', app)`** (300 s timeout) — Seeds the entire scenario once; every `it` below reads the rows it left behind.
- **`subjects`** — `Record<string, string>` mapping guarantee names to row IDs, produced by the build.
- **`wireShape<T>(value)`** — `JSON.parse(JSON.stringify(value))` to mimic Express's `JSON.stringify` so `Date`/`ObjectId` become wire strings before Zod-schema validation.
- **`describe("the shop scenario's guarantees")`** — Calls `assertScenarioGuarantees('shop', subjects)` in both directions (every declared subject resolved, no orphans).
- **`describe('each subject names a row that really has the property')`** — Per-guarantee assertions: product states (`softDeleted`, `inactive`, `offSale`, `outOfStock`, `barebones`, `inStock`, `rich`, `digital`, `lowStock`, `noWithdrawal`, `heavy`), catalogue tax/weight/digital counts, user persona states (unverified, banned, pending-email), staff account readiness, and (in the truncated portion) order/payment/delivery/return/address/audit/inventory guarantees checked via their respective models and Zod response schemas.

## Relationships

- **`scenarios/index.ts`** — Source of `buildScenario`, the single entry point that seeds all module data and returns the subject map.
- **`scenarios/check.ts`** — Provides `assertScenarioGuarantees`, the bidirectional (name→row, row→name) consistency check.
- **`scenarios/accounts.ts`** — Exports `SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_TWO_FACTOR_BACKUP_CODES`, `seedCredentials`, etc., used to look up users and verify their state.
- **`scenarios/users.ts`** — Exports `SEED_CUSTOMER_IDS` for customer-level assertions.
- **`src/app.ts`** — `createApp` builds the full Express app with all enabled modules so the build runs through the real middleware stack.
- **`src/modules/products/model.ts` / `presenter.ts`** — `productModel` for direct row reads; `presentProduct` to compute the consumer-facing `available` counter (as opposed to raw `onHand`).
- **`src/modules/orders/index.ts` / `model.ts`** — `orderService` and `orderModel` for order-level guarantee checks.
- **`src/modules/payments/model.ts`** — `paymentModel` for payment-row assertions.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel`, `shipmentModel` for shipping/refund guarantees.
- **`src/modules/inventory/model.ts`** — `reservationModel`, `stockMovementModel` for stock-level assertions.
- **`src/modules/addresses/model.ts` / `pii.ts`** — `addressBookModel` for row lookups; `decryptAddressItem` to decrypt PII fields exactly as the production reader does before serializing against the `Address` contract schema.
- **`src/modules/audit-logs/model.ts`** — `auditLogModel` for audit-entry row checks.
- **`src/modules/account/two-factor/backup-codes.ts`** — `hashBackupCode` to verify backup-code rows match the expected hash.

## Notes

- **Timeout**: `BUILD_TIMEOUT_MS = 300_000` (5 min) — deliberately far above the suite default because the build performs ~12 password-hash logins and several hundred HTTP round-trips. It runs only once.
- **`wireShape` vs `structuredClone`**: The JSON round-trip is intentional; `structuredClone` would preserve `Date`/`ObjectId` as live instances, defeating the purpose of simulating wire serialization.
- **`available` vs `onHand`**: Out-of-stock assertions use `presentProduct(product).available === 0`, not `onHand === 0`, because the storefront badge reads the derived counter. A product fully held in reservations would show `onHand > 0` yet be unbuyable.
- **Locales are excluded** from schema validation by design: `scenarios/locales.ts` publishes a *stored* shape with no serving endpoint; validating it against a response schema would be a false guardrail.
- **Address book** is the one stored shape that *is* validated: after `decryptAddressItem`, the entry must parse as the contract's `Address` response schema.
- **File sandbox**: The build uploads a product image through the real route; `emptyFileSandbox` in `afterAll` cleans it up.
