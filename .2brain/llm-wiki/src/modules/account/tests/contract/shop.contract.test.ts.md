---
source: src/modules/account/tests/contract/shop.contract.test.ts
sha256: fa530099a782f6ae490a5bf76785cdfe0b5e8781b5a19f84a7a4eaffce4b96e3
generated_at: 2026-11-08T04:32:51.666947+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/shop.contract.test.ts

## Purpose

Contract tests for the shop-facing surface of the `/account` personal-data export: orders, payments, invoicing, delivery/fulfillment, and the address snapshot carried by a checkout. Kept as a separate file from the rest of the `/account` contract so that removing the shop domain removes exactly this file and nothing else.

## Key elements

- **`describe('POST /account/export', …)`** — five test cases covering:
  - Cross-collection data return (profile, orders, payments, sessions) with a 202→200 async-export flow.
  - A fully-seeded account where no section is empty and no `null` appears anywhere.
  - Invoice / credit-note / cart rows exposing only their documented fields.
  - Shipment and held-fulfillment-order payloads.
  - Tenant isolation (another user's orders never leak in).
- **`describe('the address book at checkout', …)`** — verifies the address snapshot attached to a checkout (content truncated in source).
- **`EXPECTED_EMPTY_SECTIONS: string[]`** — sorted allow-list of sections the rich seed intentionally leaves empty; a new empty section will fail the test until added here.
- **`EXPORTED_SESSION_KEYS: Set<string>`** — the only keys permitted on an exported session record; anything else (e.g. a credential) is a contract violation.
- **`afterEach(() => settleInlineExports().then(emptyFileSandbox))`** — flushes background export writes and clears the file sandbox after every test.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/export.ts` | Imports `settleInlineExports` (used in `afterEach`). |
| `src/modules/account/tests/contract/support.ts` | Imports `loginWithCookie` helper. |
| `src/modules/payments/index.ts` | Imports `paymentService` (create intent, confirm, find for export). |
| `src/modules/payments/tests/factories.ts` | Imports `refundOrderPayment`. |
| `src/modules/orders/tests/factories.ts` | Imports `createOrder`, `forceOrderStatus`, `toOrderItem`. |
| `src/modules/delivery/index.ts` | Imports `deliveryService` (`holdFulfillmentOrder`). |
| `src/modules/delivery/tests/factories.ts` | Imports `carryOrderTo`, `fulfillmentOrdersOf`. |
| `src/modules/invoicing/index.ts` | Imports `invoicingService` (find invoice / credit notes). |
| `src/modules/access/index.ts` | Imports `accessService`, `DEPLOYMENT_TENANT_SLUG`. |
| `src/modules/addresses/tests/factories.ts` | Imports `giveAddress`. |
| `src/modules/example/tests/factories.ts` | Imports `createExample`. |
| `src/modules/notifications/tests/factories.ts` | Imports `createNotification`. |
| `src/infrastructure/http/response.ts` | Imports `ResponseSuccess` type (payment intent cast). |

## Notes

- **Isolation contract:** the file header states explicitly that removing the shop domain should mean deleting only this file. Do not add imports from non-shop modules without updating the other `/account` contract files instead.
- **`@tests/contract` side-effect import:** pulled in for shared contract-level `beforeAll`/`afterEach` hooks (e.g. null-path sweeping); it has no named export used here.
- **`EXPECTED_EMPTY_SECTIONS` is an allow-list, not a deny-list.** Adding a new shop section that the seed can't fill requires extending this array or the test will fail.
- **Pagination read is exercised only here:** the comment on the payment assertion notes that `paymentService.findOwnPaymentsForExport`'s page-walk logic is never hit by any other test; a regression in that path will surface in this file exclusively.
- **Session metadata guard:** `EXPORTED_SESSION_KEYS` is deliberately a closed set. If a new legitimate session metadata field is added to the export, the key must be added to the set before it can appear in test fixtures.
