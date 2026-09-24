---
source: tests/integration/scenarios/shop.test.ts
sha256: 5cc72ba23d3aeb8bff922e5adc62862ad1d12102e85cf4a1c16d0d750c1d6204
generated_at: 2026-09-23T20:06:48.074027+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/shop.test.ts

## Purpose

Integration test that builds the full `shop` scenario through the application's own HTTP endpoints (checkout, payment, shipping, refund, admin) into a live database, then verifies four guarantee classes: (1) every module's `scenario.shop` subjects resolve with no orphans, (2) each subject id names an existing row, (3) each row carries the property its name claims _where the consumer reads it_, and (4) a produced row is valid input to the contract's own response schema. It is the only suite in the repo that builds once and reads that single state across all cases.

## Key elements

- **`beforeAll(connect)` / `afterAll(disconnect)`** — raw DB lifecycle; deliberately avoids `setupTestDb` so the built data survives across `it()` blocks.
- **`beforeAll(buildScenario('shop', app), 300_000)`** — one 5-minute build via the same code path as `npm run demo` / `scenario:apply`; result stored in module-level `subjects` map.
- **`setTranslatables(resolveTranslatables(enabledModules))`** — installs the locales write surface before the build so `products.seed()` can write translations; cleared in `afterAll`.
- **`wireShape<T>(value)`** — `JSON.parse(JSON.stringify(value))` to simulate the wire (converts `Date`→ISO, `ObjectId`→string) since the test never goes through Express's `res.json()`.
- **`describe("the shop scenario's guarantees")`** — calls `assertScenarioGuarantees('shop', subjects)` to check bidirectional completeness.
- **`describe('each subject names a row…')`** — individual `it` blocks for product states (`softDeleted`, `inactive`, `outOfStock`, `barebones`, `inStock`, `rich`), order states (pending/paid/shipped/delivered/cancelled/softDeleted/paidOffline/awaitingTransfer), and payment (`refunded`); uses `it.each` for the four straightforward order statuses.
- **`describe('the history reads as a history')`** — verifies temporal spread (>30 days, <90 days), audit-entry co-location with its order, and stock-ledger reconciliation via `stockMovementModel.aggregate`.
- **Imports of response schemas** (`CreateProductResponse`, `CreateOrderResponse`, `GetUserByIdResponse`, `ListAuditEntriesResponse`, `GetAddressesResponse` from `@api/schemas.zod`) — used for claim 4 (schema conformance) on the truncated portion.

## Relationships

- **`scenarios/index.ts`** — source of `buildScenario`, the function that drives `app` through the full shop flow.
- **`scenarios/check.ts`** — source of `assertScenarioGuarantees`, the bidirectional subject-completeness validator.
- **`scenarios/accounts.ts`** — provides `SEED_ADMIN_ID` / `SEED_USER_ID` constants used in ownership assertions.
- **`src/app.ts`** — the Express `app` instance handed to `buildScenario` as the endpoint driver.
- **`src/modules.ts`** — `enabledModules` feeds the translatable-manifest resolution.
- **`src/kernel/registry.ts`** — `resolveTranslatables` builds the per-module translation write-surface config.
- **`src/modules/locales/module.ts`** — `setTranslatables` installs/clears the locale write surface for the test lifecycle.
- **`src/modules/products/model.ts`** — `productModel` for row lookups; `toProduct` for the consumer-facing mapping (e.g., `available` derived from `onHand` + reservations).
- **`src/modules/orders/model.ts`** — `orderModel` for order status/ownership/deletion assertions.
- **`src/modules/orders/index.ts`** — `orderService` (imported for the build-driven flow and/or direct service assertions).
- **`src/modules/payments/model.ts`** — `paymentModel` for method/status checks (`cash`, `refunded`, `succeeded`).
- **`src/modules/inventory/model.ts`** — `reservationModel` (held-stock assertions) and `stockMovementModel` (ledger reconciliation aggregate).
- **`src/modules/audit-logs/model.ts`** — `auditLogModel` for verifying the audit trail exists alongside its order and is temporally co-located.
- **`src/modules/addresses/model.ts`** — `addressBookModel`; address entries are the one "stored shape" validated against the contract's `Address` schema (the model docblock guarantees they already serialize identically).

## Notes

- **No `setupTestDb`.** The database _is_ the subject; rebuilding per-test would destroy it. One build, many reads.
- **`outOfStock` ≠ `onHand === 0`.** The storefront badge reads the derived `available` counter; a fully-reserved product can have `onHand > 0` but `available === 0`. The test asserts via `toProduct(product).available`.
- **`order.softDeleted` is owned by the non-admin seed user.** An admin-owned row could never exercise the "owner sees 404 on their own deleted order" path.
- **Locales are intentionally excluded from schema checks.** No endpoint serves a raw locale row; the locale tier-merge builds the response. Validating a stored row against a response schema would be a false guardrail.
- **Stock ledger is the source of truth.** No product can have `onHand > 0` without corresponding `stockmovements` rows, because stock only enters via `POST /inventory/receipts`. The test reconciles the mirror against the ledger aggregate rather than trusting either alone.
- **Audit retention window.** The oldest order must be >30 days old but <90 days (`NODE_AUDIT_RETENTION_DAYS`), or the audit trail behind it would have been reaped, contradicting the dataset.
