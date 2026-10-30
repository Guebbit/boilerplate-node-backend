---
source: src/modules/account/tests/contract/shop.contract.test.ts
sha256: c452a40b653e2ee9e6524ab2b094e2ffc0c676e53ff633339d9b96c35e130933
generated_at: 2026-10-29T02:52:32.715756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/shop.contract.test.ts

## Purpose

Contract tests for the shop-facing slices of `POST /account/export`: orders, payments, invoicing, cart, shipments, fulfillment orders, and the checkout address snapshot. It is deliberately isolated from the rest of the `/account` contract so that removing the shop module takes exactly this file with it.

## Key elements

- **`EXPECTED_EMPTY_SECTIONS`** – Sorted list of export sections the rich seed intentionally leaves empty. Currently `[]`; any new unfillable section should be named here so it is noticed.
- **`EXPORTED_SESSION_KEYS`** – Whitelist (`id`, `createdAt`, `expiration`, `lastUsedAt`, `device`) of the only session metadata an export may expose; anything else fails the test.
- **`describe('POST /account/export', …)`** – Main suite. Covers:
  - Caller-owned data returned with correct 202→200 handshake and no cross-account leakage.
  - Zero `null` values across a fully-populated account (via `nullPathsIn`).
  - Invoice / credit-note field shape (`currency`, `grandTotal`, `issuedAt`, `number`, `orderId`) and exact cart-line content.
  - Shipment tracking code and held-fulfillment-order note in the export.
  - Isolation: another user's order never appears.
- **`describe('the address book at checkout', …)`** – (truncated in source) Verifies the address snapshot carried by a checkout.
- **`afterEach` hook** – Calls `settleInlineExports()` then `emptyFileSandbox()` to flush background export builds and clean the sandbox.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/tests/contract/support.ts` | Provides `loginWithCookie`, the shared auth helper for these tests. |
| `src/modules/account/services/export.ts` | Exports `settleInlineExports`, awaited in `afterEach` to drain background export work. |
| `src/infrastructure/http/response.ts` | Type-only import of `ResponseSuccess` for narrowing payment intents. |
| `src/modules/access/index.ts` | `accessService.ensureTenant` and `DEPLOYMENT_TENANT_SLUG` seed the tenant before a fully-populated export test. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` creates the user's address row. |
| `src/modules/delivery/index.ts` | `deliveryService.holdFulfillmentOrder` is called to create a held fulfillment record. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo` advances an order to *shipped*; `fulfillmentOrdersOf` reads the resulting fulfillment row. |
| `src/modules/example/tests/factories.ts` | `createExample` seeds an "example" collection row. |
| `src/modules/invoicing/index.ts` | `invoicingService.findInvoiceForOrder` / `findCreditNotesForOrder` poll for async invoice creation. |
| `src/modules/notifications/tests/factories.ts` | `createNotification` seeds a notification row. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `forceOrderStatus`, `toOrderItem` build order fixtures. |
| `src/modules/payments/index.ts` | `paymentService.createIntent` / `confirmPayment` create and settle payments. |

## Notes

- The comment on the payments assertion flags that `paymentService.findOwnPaymentsForExport` (in `payments/services/retention.ts`) is the **only** code path this test exercises for paginated payment reads; a broken page-walk surfaces nowhere else.
- The session export invariant ("never a credential") is enforced structurally via `EXPORTED_SESSION_KEYS` rather than by asserting the absence of specific secret fields, so a new leaked field is caught automatically.
- `settleInlineExports` is async; forgetting the `afterEach` cleanup will leak sandbox files into subsequent tests.
- The file is intentionally the **only** contract-test file that imports shop/delivery/invoicing/payments factories. When the shop module is extracted, delete this file and its `support.ts` sibling; no other test file should need changes.
