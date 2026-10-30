---
source: scenarios/support/doubles/payments/levers.ts
sha256: 63868bd30f94833b01a742a2022472ef1322cfff411915c48fc48640478aae79
generated_at: 2026-10-29T01:27:15.432920+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/levers.ts

## Purpose

Test levers (HTTP endpoints under `/__test/payments/…`) that let integration tests drive the fake payment service provider: force refunds to fail with a specific reason, or simulate a buyer's bank opening and progressing a dispute. The file lives beside `./fake` in the `payments/` subfolder because `payments` is a `group: shop` module that `demo:remove` deletes wholesale; `levers.generated.ts` is then rebuilt from the folders that remain so the demo's control surface never hard-codes a module name.

## Key elements

- **`installLever(app)`** *(exported)* — Mounts both lever endpoints on the Express app. Called by `installModuleLevers` during demo assembly.
- **`installDisputeLever(app)`** — Registers `POST /__test/payments/dispute`. Validates the body, reads the payment from the DB, stores the provider's dispute report via `setFakeDispute`, then delivers it through `paymentService.applyWebhookDelivery` (mirroring what a real webhook route would do after signature verification).
- **`REFUND_FAILURE_BODY`** — Zod schema for the refund-failure lever: `{ orderId, reason: RefundFailureReason | null }`.
- **`DISPUTE_BODY`** — Zod schema for the dispute lever: `{ orderId, disputeId?, kind?, status?, reason?, amount?, evidenceInDays? }`. All fields except `orderId` have defaults, so `{ orderId }` opens a `chargeback` in `needs_response` state with a 14-day evidence deadline. Re-sending the same `disputeId` with a new `status` advances the existing dispute.
- **`paymentOf(orderId)`** — Reads a document from the `payments` collection (returns `providerRef`, `amount`, `currency`).
- **`providerRefOf(orderId)`** — Thin wrapper returning just the `providerRef` field.
- **`setFakeDispute` / `setFakeRefundFailure`** — Imported from `./fake`; the actual state-mutation primitives the levers delegate to.

## Relationships

- **`./fake` (`scenarios/support/doubles/payments/fake.ts`)** — Provides `setFakeDispute` and `setFakeRefundFailure`, the low-level state setters the levers call before responding.
- **`src/modules/payments/index.ts`** — Exports `paymentService`, whose `applyWebhookDelivery` method the dispute lever uses to push the stored dispute through the normal service pipeline.
- **`src/infrastructure/runtime/database.ts`** — `connection.collection('payments')` is used to look up the payment's `providerRef` and `currency` by `orderId`.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is the uniform error-exit helper for 400/404/500 paths.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` in the `.catch` blocks of both levers.
- **`src/types/index.ts`** — Enum types (`DisputeKind`, `DisputeReason`, `DisputeStatus`, `RefundFailureReason`) used in the Zod schemas and delivery payloads.
- **`scenarios/support/doubles/levers.generated.ts`** — Rebuilt after `demo:remove` deletes this folder; the generated file aggregates the levers from whatever module folders survive, so no consumer names this module directly.

## Notes

- **`null` → `undefined` for refund-failure clearing.** In the refund-failure handler, `body.data.reason ?? undefined` converts a JSON `null` to `undefined`. That is the contract by which the fake PSP "clears" a previously set failure; `./fake` must treat `undefined` as "no failure."
- **Dispute amount defaults to the stored payment amount.** If the caller omits `amount`, the lever reads `payment.amount` (a MongoDB Decimal128) and converts it via `Number(String(…))` before passing it to `setFakeDispute`.
- **`fundsWithdrawn` is derived.** It is `true` when `kind === 'chargeback'` and `status !== 'won'`; the caller cannot set it directly.
- **Stryker guards.** Both `.catch` blocks carry `// Stryker disable next-line all` to prevent mutation-testing from altering the `logger.error` call.
- **Read path bypasses the service layer.** `paymentOf` queries the `payments` collection directly rather than going through a repository/service, because the levers need the raw `providerRef` that the public API hides.
