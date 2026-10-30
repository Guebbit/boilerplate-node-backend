---
source: src/modules/returns/services/close.ts
sha256: dbd290ea12485120e903136a5053627dfef0c5698b4cbc8b1fdc318139ebe06a
generated_at: 2026-10-29T05:41:41.286251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/close.ts

## Purpose

Handles the transition of a return to `closed` status after its money has gone back. Provides two public entry points — `closeReturn` (automatic, tied to refund settlement) and `closeReturnByHand` (manual staff action when no refund occurred) — both built on a shared atomic claim-and-append operation that is safe under concurrent calls.

## Key elements

- **`claimClosed`** (private) — Atomic step: calls `returnRepository.claimStatus` to move the return from a clicable status to `closed` within a caller-supplied transaction, then appends a `return_closed` timeline row to the order. Returns `null` if the return was not in a closable state (lost race).
- **`closeReturn`** (exported, `@internal`) — Wraps `claimClosed` in `announceInTransaction` so the `returnClosedEvent` outbox message is written in the same transaction. Then syncs the return status on the order projection. Intended as a lower-level step for `receiveReturn` and the `PAYMENT_REFUNDED` listener; it checks state but never whether the refund actually settled.
- **`closeReturnByHand`** (exported) — Staff-initiated close for returns where no refund will follow (canceled, external payment). Uses `withTransaction`, records an audit entry with optional note, syncs projection, and returns an HTTP success/reject response. Does **not** publish `returnClosedEvent`.
- **`notClosable`** (private) — Builds the HTTP error response: 404 if the return doesn't exist, 409 with `RETURN_NOT_CLOSABLE` if it does but isn't in a closable status.

## Relationships

- **`@modules/returns/repository`** — `returnRepository.claimStatus` performs the conditional status move; `findById` is used for the 404/409 distinction in `notClosable`.
- **`@modules/orders` (→ `orderService`)** — `appendTimeline` writes the `return_closed` event onto the order's timeline within the same transaction.
- **`@kernel/outbox`** — `announceInTransaction` ensures `returnClosedEvent` is atomically persisted alongside the status change (used only by `closeReturn`, not `closeReturnByHand`).
- **`@modules/returns/domain`** — `CLOSABLE_RETURN_STATUSES` defines which statuses are eligible for the conditional move (i.e., `received`).
- **`@modules/returns/audit`** — `returnsAuditActions.ADMIN_RETURN_CLOSED` is the audit action code stamped in `closeReturnByHand`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the staff audit row in the hand-close path.
- **`@infrastructure/runtime/database`** — `withTransaction` supplies the Mongoose session for `closeReturnByHand`.
- **`@infrastructure/i18n`** — `t` provides localized error messages (`returns.not-closable`, `returns.not-found`).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP payloads returned by `closeReturnByHand`.
- **`src/modules/returns/services/projection`** — `syncReturnStatus` refreshes the denormalized return status on the order document after a successful close.
- **`src/modules/returns/services/outcome`** — `returnClosedEvent` is the outbox payload describing the close.
- **`src/modules/returns/module.ts`** — Registers the `PAYMENT_REFUNDED` listener that calls `closeReturn` asynchronously when a previously-refused refund later settles.
- **`src/modules/returns/services/index.ts`** — Re-exports `closeReturn` and `closeReturnByHand` for external consumers.

## Notes

- **Idempotency via conditional move.** Both automatic paths (same-request refund and the async `PAYMENT_REFUNDED` listener) call the same `claimClosed`. Whichever arrives second gets `null` from `claimStatus` and does nothing — no duplicate timeline rows, no duplicate outbox events.
- **`closeReturnByHand` deliberately omits the outbox event.** The `returnClosedEvent` email tells the customer "your money is back," which would be false in the hand-close case. The rationale lives only in the audit note and the timeline row.
- **`closeReturn` is `@internal`.** Callers (`receiveReturn`, the module's listener) own the "refund settled" fact; this function only checks state, so it must not be published or invoked without that context.
- **`syncReturnStatus` runs after the transaction commits** in both paths, so a projection failure does not roll back the return close.
