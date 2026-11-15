---
source: src/modules/payments/services/errors.ts
sha256: afb781363b943a26faeaa71cdba806ba8cfe3fd241d4fdf57cec20d1ce4dbb1b
generated_at: 2026-11-14T21:06:11.454608+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/errors.ts

## Purpose

Centralised error responses and error classes for the payments service layer. It is deliberately a leaf module (no persistence imports) so every file under `services/` can reach a shared error shape without pulling in additional edges. All "order can no longer be paid" paths, 404s, refund refusals, and unknown-provider webhook cases flow through the exports here.

## Key elements

- **`notPayable(): ResponseReject`** — Returns a 409 with `ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE` and an i18n-translated message. Covers three indistinguishable-to-the-client cases: `isPayable` check failed, race between check and write, or provider bounced the charge because the order was gone.
- **`paymentNotFound(): ResponseReject`** — 404 response for a payment ID that does not exist or is not visible to the caller.
- **`orderNotFound(): ResponseReject`** — 404 response for an order ID referenced by a payment action that does not exist or is not visible to the caller.
- **`RefundLeftOpenError`** — Extends `Error`. Carries `refundId` (the record now in `failed` state, held in `amountRefunded`) and wraps the provider's rejection as `cause`. Signals that the record *does* exist and will be retried by the refund sweep with the same idempotency key.
- **`WebhookProviderUnknownError`** — Extends `Error`. Carries `providerName`. Raised when a webhook URL names a provider that has no installed adapter; the controller answers 404.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type; all three response functions delegate to `generateReject`.
- **`src/infrastructure/i18n/index.ts`** (re-exported via `context.ts`) — Imports `t()` for all user-facing messages.
- **`src/modules/payments/services/intent.ts`** — Consumes `notPayable`, `paymentNotFound`, `orderNotFound` during payment intent creation and validation.
- **`src/modules/payments/services/refunds.ts`** — Throws `RefundLeftOpenError` when a provider rejects an already-recorded refund; also uses `notPayable`.
- **`src/modules/payments/services/offline.ts`**, **`settlement.ts`**, **`view.ts`** — Import the 409/404 response helpers for their respective failure paths.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — Catches `WebhookProviderUnknownError` to return 404 for unrecognised provider names.
- **`src/modules/payments/services/index.ts`** — Re-exports this module's surface so callers can import from the services barrel.
- **`src/modules/payments/tests/integration/service.test.ts`** — Asserts on the response shapes and error classes produced by these exports.

## Notes

- The module imports `ERROR_CODES` from `@api/error-codes`; the error code constants live outside the payments module tree.
- `notPayable` intentionally does **not** distinguish the three triggering scenarios (pre-write check, race, provider bounce). A client cannot tell them apart and is not expected to.
- `RefundLeftOpenError` is the *only* error class that implies the refund record still exists in a known `failed` state. Any other thrown error in the refund path means the record may not exist or its state is unknown.
- Messages are all passed through `t()` — they are localisation keys, not raw strings. Do not compare `message` fields in tests; assert on the `code` field or error class name instead.
