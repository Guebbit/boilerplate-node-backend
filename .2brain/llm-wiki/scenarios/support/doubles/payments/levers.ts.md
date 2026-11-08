---
source: scenarios/support/doubles/payments/levers.ts
sha256: dfe9e11cfa872b60aeb03af6d39f7e673b69e35c5cc18c6dd3dc4f1627ba779e
generated_at: 2026-11-08T02:34:22.376582+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/levers.ts

## Purpose

Demo-profile test levers for the payments module. Exposes two `POST /__test/payments/…` endpoints that let the demo UI and integration tests drive the fake PSP: one simulates refund rejections for a given order, the other injects (or advances) a dispute/chargeback. Kept in its own file beside `./fake` so that `demo:remove` can delete the whole `payments` folder without touching the shared demo surface.

## Key elements

- **`installLever(app: Express)`** *(exported)* — Entry point called by `installModuleLevers` → `installDemo`. Mounts both endpoints.
- **`installDisputeLever(app: Express)`** — Mounts `POST /__test/payments/dispute`. Validates the body, reads the payment's `providerRef` from the DB, calls `setFakeDispute` to record the provider's report in the fake, then delivers it through `paymentService.applyWebhookDelivery`.
- **`REFUND_FAILURE_BODY`** — Zod schema for the refund-failure endpoint (`orderId` + nullable `RefundFailureReason`).
- **`DISPUTE_BODY`** — Zod schema for the dispute endpoint; most fields default (`disputeId: 'dp_demo'`, `kind: 'chargeback'`, `status: 'needs_response'`, `reason: 'fraudulent'`, `evidenceInDays: 14`).
- **`paymentOf(orderId)`** — Queries the `payments` collection directly (bypasses the service) to retrieve `providerRef`, `amount`, `currency`.
- **`providerRefOf(orderId)`** — Thin wrapper returning just the `providerRef`.

## Relationships

- **`./fake`** — Calls `setFakeDispute` and `setFakeRefundFailure` to mutate the fake PSP's internal state.
- **`src/modules/payments/index.ts`** — Imports `paymentService` to deliver the webhook payload the same way the real webhook route would.
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` for all 400/404/500 error paths.
- **`src/infrastructure/adapters/logger.ts`** — Logs a structured error object in each catch block.
- **`src/infrastructure/runtime/database.ts`** — Uses the raw `connection` to read the `payments` collection (the service layer hides `providerRef`).
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to compute `evidenceDueBy`.
- **`src/types/index.ts`** — Imports the closed enums `DisputeKind`, `DisputeReason`, `DisputeStatus`, `RefundFailureReason`.
- **`tests/integration/journeys/the-provider-disagrees.test.ts`** — Consumer of the dispute lever.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Consumer of the refund-failure lever.

## Notes

- **File placement is load-bearing.** The file must live in the `payments` module folder so that `demo:remove` (which deletes `group: shop` folders) removes it automatically. `levers.generated.ts` is regenerated from surviving folders, so the demo surface never references a module by name.
- **`null` → `undefined` on refund failure.** Passing `reason: null` clears the refusal; the code maps it to `undefined` before calling `setFakeRefundFailure`.
- **Idempotent dispute.** Re-sending the same `disputeId` with a different `status` advances the existing dispute rather than creating a new one.
- **Direct DB read.** The levers read `providerRef` straight from Mongo because the domain wire shape intentionally hides the provider's identifier; only these test helpers need it.
- **Stryker suppressions.** The two `logger.error` lines carry `// Stryker disable next-line all` to prevent mutation-testing from flagging the error-message strings.
