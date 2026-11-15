---
source: scenarios/support/doubles/payments/levers.ts
sha256: fe50132c6205c4dda8a510d8ab9b8abb2374ff3caabf61991ab2dc7b38cf6bc4
generated_at: 2026-11-14T17:18:20.000973+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/levers.ts

## Purpose

Defines the demo profile's HTTP "levers" for the payments double: two `POST /__test/payments/*` endpoints that let an operator script refund failures and buyer disputes against the fake PSP. The file lives beside (not inside) the payments module folder so that `demo:remove` deletes the module without orphaning the lever; `levers.generated.ts` is rebuilt from whatever folders remain, keeping `demo.ts` free of module names.

## Key elements

- **`installLever(app)`** *(export)* — Mounts both lever endpoints on the Express app. Called by `installModuleLevers` during `installDemo`.
- **`installDisputeLever(app)`** *(internal)* — Mounts `POST /__test/payments/dispute`. Looks up the order's payment in MongoDB, calls `setFakeDispute` with the caller's dispute state, signs the delivery via `signFakeDelivery`, then routes it through `paymentService.receiveWebhook` (the same signed-webhook door the production route uses).
- **`REFUND_FAILURE_BODY`** — Zod schema: `orderId` (ObjectId string) + `reason` (nullable `RefundFailureReason`). `null` clears the failure.
- **`DISPUTE_BODY`** — Zod schema: `orderId` plus optional `disputeId`, `kind`, `status`, `reason`, `amount`, `evidenceInDays` — all with sensible defaults so `{ orderId }` opens a 14-day chargeback for the full amount.
- **`paymentOf(orderId)`** — Reads a single payment document from the `payments` collection to obtain `providerRef`, `amount`, `currency`.
- **`providerRefOf(orderId)`** — Convenience wrapper returning just the `providerRef` string.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Consumes `setFakeDispute`, `setFakeRefundFailure`, and `signFakeDelivery` to record state in the fake PSP and produce a signed webhook payload.
- **`src/modules/payments/index.ts`** / **`src/modules/payments/services/index.ts`** — Calls `paymentService.receiveWebhook('fake', …)` so the dispute flows through the real parsing/validation/signature pipeline rather than a shortcut.
- **`src/infrastructure/runtime/database.ts`** — Uses `connection.collection('payments')` to read the payment document (provider ref, amount, currency).
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` for 400/404/500 replies.
- **`src/infrastructure/persistence/create-repository.ts`** — Uses `isObjectIdString` in the zod `refine` validators.
- **`src/infrastructure/adapters/logger.ts`** — Logs a contextual error before returning 500.
- **`src/domain-primitives/time.ts`** — Uses `DAY_MS` to compute `evidenceDueBy` from the `evidenceInDays` field.
- **`src/types/index.ts`** — Imports `DisputeKind`, `DisputeReason`, `DisputeStatus`, `RefundFailureReason` enums for the zod schemas.
- **`tests/unit/scenarios/payments-fake.test.ts`** — Unit-tests the fake's state transitions that the levers drive.
- **`tests/integration/journeys/the-provider-disagrees.test.ts`** — Integration journey that exercises the dispute lever end-to-end.

## Notes

- **Why a separate file:** `payments` is a `group: shop` module. Placing the lever inside the module folder would cause `demo:remove` to delete it. Keeping it beside the folder and regenerating `levers.generated.ts` avoids hard-coding module names in `demo.ts`.
- **No webhook shortcut:** The dispute lever signs the delivery with `signFakeDelivery` and delivers via `paymentService.receiveWebhook`, so the signature check and payload parsing run exactly as they would in production.
- **`null` → `undefined`:** In the refund-failure endpoint, a `null` reason is passed as `undefined` to `setFakeRefundFailure`, which is the fake's "clear the failure" signal.
- **Amount/currency defaults:** When the caller omits `amount`, the lever reads it from the payment document in the DB; `currency` is always taken from the document (the caller cannot override it).
