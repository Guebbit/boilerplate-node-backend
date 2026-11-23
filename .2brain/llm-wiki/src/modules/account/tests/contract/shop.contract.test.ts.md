---
source: src/modules/account/tests/contract/shop.contract.test.ts
source_sha256: 81e3177f7d5a49aed5951e64e3af1664e1e7166748bb3f24b49096ae139fd53b
context_sha256: 54712cd4d7a4344414f927dac9ad1f7b845db6f84bb5b9191504b8cae999853d
generated_at: 2026-11-22T03:51:20.572761+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/shop.contract.test.ts

## Purpose
Contract tests for the parts of `/account` that reach into the shop: the personal-data export's orders, payments, invoicing, shipments and fulfillment orders, plus the address snapshot a checkout carries. It is kept separate from the rest of the `/account` contract so that removing the shop removes exactly this file.

## Key elements
- `setupTestDb()` plus an `afterEach` that runs `settleInlineExports()` and then `emptyFileSandbox`. Exports are built in the background and written to the sandbox, so the hook waits for them and then sweeps the files.
- `EXPECTED_EMPTY_SECTIONS` (currently `[]`): the sorted list of export sections the rich seed is expected to leave empty. A new empty section fails the test.
- `EXPORTED_SESSION_KEYS`: the only metadata keys an exported session may carry (`id`, `createdAt`, `expiration`, `lastUsedAt`, `device`). It guards against credential leaks.
- `describe('POST /account/export')`:
  - Checks the caller's own profile, orders, payments (including `orderId`) and sessions, and that the response satisfies the contract.
  - Seeds data in every section and asserts no empty sections and no `null` anywhere, using `nullPathsIn`.
  - Checks that invoices and credit notes expose exactly `currency`, `grandTotal`, `issuedAt`, `number` and `orderId`. It also checks that the cart is exactly `{productId, quantity}`. The flow is create intent, confirm with `pm_card_visa`, wait for the invoice, refund, then wait for the credit note.
  - Checks that a shipment (with tracking code `TRK-CARRIED01`) and a held fulfillment order (with `holdNote`) are exported.
  - Checks that another user's orders are never included.
- `describe('the address book at checkout')`: starts after the visible part of the file, so its contents are not documented here.

## Relationships
- `@tests/http`, `@tests/checkout-as`, `@tests/account-export` and `./support` (`loginWithCookie`) provide the HTTP and login helpers. `requestAndDownloadExport` requests the export and downloads the result.
- `../../services/export` supplies `settleInlineExports`, which is imported specifically for the test lifecycle.
- `accessService` and `DEPLOYMENT_TENANT_SLUG` from `@modules/access` ensure the tenant exists before the "no null" test.
- `paymentService` creates and confirms payment intents. `refundOrderPayment` comes from the payments test factories.
- `invoicingService` is polled via `eventually` for invoices and credit notes.
- `deliveryService` is used to hold a fulfillment order. `carryOrderTo` and `fulfillmentOrdersOf` from the delivery factories move an order to shipped and read its fulfillment orders.
- The test factories for addresses, examples, notifications, orders, products, users and system tasks seed the data.
- `ResponseSuccess` from `@infrastructure/http/response` is used to type the payment intent result.
- `@tests/callers` supplies `asAdmin`, `asCustomer`, `callerContextAs` and `testCallerContext`.

## Notes
- `import '@tests/contract'` applies the shared contract checks, including an `afterEach` that also catches nulls in responses.
- The payments test comments that `paymentService.findOwnPaymentsForExport` is exercised only through this export. A broken pagination read would show up only here.
- The fake PSP treats the `pm_card_visa` reference as always succeeding.
- The invoice and credit note are created asynchronously, hence the `eventually` polling.
