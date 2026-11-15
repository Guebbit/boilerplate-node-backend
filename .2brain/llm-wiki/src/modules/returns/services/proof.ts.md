---
source: src/modules/returns/services/proof.ts
sha256: 87c9a800883f4fb7c33e0b9314f3c0f56bef76f172cb7320bfef47323796e524
generated_at: 2026-11-14T21:39:49.057549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/proof.ts

## Purpose

Records the buyer's proof of sending (carrier document: date, carrier name, tracking reference) against an approved return. For a withdrawal return it also opens and dispatches the refund within the same flow; for a defective/wrong-item return it only stamps the proof, deferring the remedy to receipt. Implements the one-time, idempotency-guarded write that transitions the return toward completion per Directive 2011/83/EU Art. 13(3).

## Key elements

- **`ProofOfSendingInput`** — input shape: `sentAt` (Date), `carrier` (string), `reference` (string).
- **`recordProofOfSending(id, input, context)`** — exported entry point. Validates (future-date 422, not-found 404, lifecycle 409, already-recorded 409), loads the order, delegates to `stampProof`, records an audit event, and on a withdrawal sends the opened refund post-commit.
- **`stampProof(returned, order, input, context)`** — single database transaction: locks the order row, quotes the owed amount (zero handling deduction), performs a conditional `claimProof` write, appends an order timeline entry, and conditionally opens a refund via the payments module.
- **`lostRace(id)`** — re-reads the return to distinguish "proof already stamped" (409) from "goods received in between" (delegates to `notReceivable`).
- **`optionalDue(stamped, sentAt)`** — computes the statutory refund deadline fragment via `refundDueFor`; returns `{}` when no deadline applies.
- **`alreadyRecorded()`** — canned 409 reject with `RETURN_PROOF_ALREADY_RECORDED`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@domain-primitives/money` | `NO_MONEY` / `toMinorUnits` to skip zero-amount refund creation. |
| `@infrastructure/http/response` | `generateSuccess`, `generateReject`, `fieldError` for all API responses. |
| `@infrastructure/i18n` | `t()` for user-facing error messages. |
| `@infrastructure/observability/audit` | `recordAudit` — emits `ADMIN_RETURN_PROOF_RECORDED` event on success. |
| `@infrastructure/runtime/database` | `withTransaction` wraps the lock → quote → claim → timeline → refund sequence. |
| `@modules/orders` | `orderService` for order lookup and timeline appending; `buyerIdOf` for audit metadata; `OrderDocument` type. |
| `@modules/payments` | `paymentService` for opening the refund (in-transaction) and sending it (post-commit); `OpenedReturnRefund` type. |
| `@modules/access` | `ownOrderFlag` — boolean stamped into audit metadata when the caller is the buyer. |
| `../domain` (`proofOpensRefund`, `returnLifecycle`, `wireLines`) | Domain predicates and line-mapping helpers. |
| `./receive` (`quote`, `notReceivable`) | Refund-amount quoting (zero deduction) and the shared 409 for non-receivable states. |
| `./refund-due` (`refundDueFor`) | Computes the legal refund deadline from the proof date. |

## Notes

- **One-time guard is two-layered:** the service-level check (`proofOfSendingAt !== undefined`) catches the common case fast; the repository-level `claimProof` conditional write is the authoritative guard against concurrent staff writes. A lost race is resolved by re-reading the document.
- **Refund is opened in-transaction but sent post-commit.** A send failure does not roll back the proof; it is left to the payment sweep to retry.
- **Zero-priced returns** (all lines total zero) skip refund creation entirely even on a withdrawal.
- **`quote` with `'0'` deduction** means no handling-fee deduction is ever applied to the proof-opened refund; a refusal from `quote` is treated as an unreachable invariant violation and thrown as an `Error`.
- **`sentAt` must not be in the future** — enforced with a 422 field error before any DB work.
