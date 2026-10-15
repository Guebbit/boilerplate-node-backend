---
source: src/modules/returns/services/decide.ts
sha256: 939f7741612f083bc7f152a8525a183c4ef7ee9807cb5c8077ca3641caf15597
generated_at: 2026-10-15T11:56:29.155536+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/decide.ts

## Purpose

Implements the staff-facing decision path for a return request: **approve** or **decline** (with a mandatory reason). Each decision is a single conditional write from `requested` (guarded by `DECIDABLE_RETURN_STATUSES`), so concurrent staff members racing on the same request cannot both succeed—the loser receives a 409. Withdrawals never reach this module; they are opened already approved.

## Key elements

- **`approveReturn(id, context)`** *(exported)* — Approves a return. Delegates to the internal `decide` with `to: 'approved'` and an empty stamp.
- **`declineReturn(id, reason, context)`** *(exported)* — Declines a return with a required `reason` string. Delegates to `decide` with `to: 'declined'` and `{ declineReason: reason }`.
- **`decide(id, to, stamp, context)`** *(internal)* — Shared decision pipeline: guard → conditional status claim (in a DB transaction, alongside the order-timeline row) → post-commit settlement. Returns 200 on success, 404/409 on a lost race.
- **`refusalForDecision(id, to, context)`** *(internal)* — Authorization guard. For **approval**: the decider must outrank the buyer *and* must not be the buyer (`ownMoneyOrderRefusal`). For **decline**: outranking alone suffices (`outrankedOrderRefusal`). Returns `undefined` (proceed) or a pre-built `ResponseReject`.
- **`settleDecision(decided, to, id, context)`** *(internal)* — Post-commit side-effects: records an audit row, syncs the order's return-status projection, sends the customer email, then builds the 200 response.
- **`notifyDecision(decided, kind)`** *(internal)* — Reads the order (number, shipping address) solely for the mail body. A missing order skips the mail but does not undo the decision.
- **`notDecidable(id)`** *(internal)* — Maps a lost race to the correct error: 404 if the return no longer exists, 409 (`RETURN_NOT_DECIDABLE`) if it does.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/response` | Builds all HTTP responses via `generateSuccess` / `generateReject`. |
| `@infrastructure/i18n` | Calls `t()` for localized error and success messages. |
| `@infrastructure/observability/audit` | Calls `recordAudit` in `settleDecision` (post-commit). |
| `@infrastructure/runtime/database` | Wraps the status claim + timeline append in `withTransaction`. |
| `@modules/orders` (`orderService`) | Reads order for mail (`getById`), appends timeline row (`appendTimeline`), and enforces rank/self-approval guards (`ownMoneyOrderRefusal`, `outrankedOrderRefusal`). |
| `@modules/returns/repository` | `returnRepository.findById` (read for guards / 404 check) and `returnRepository.claimStatus` (conditional write). |
| `@modules/returns/model` | `ReturnDocument` type used throughout. |
| `@modules/returns/audit` | `returnsAuditActions` enum for audit action names. |
| `@modules/returns/domain` | `DECIDABLE_RETURN_STATUSES` — the allowed "from" statuses for the conditional claim. |
| `@modules/returns/services/notify` | `mailReturnNotice` sends the customer email in `settleDecision`. |
| `@modules/returns/services/projection` | `syncReturnStatus` updates the order's return-status projection post-commit. |
| `@modules/returns/services/index` | Barrel that re-exports `approveReturn` / `declineReturn`. |

## Notes

- **Two authorization tiers.** Approval is stricter: the decider must outrank the buyer *and* not be the buyer. Decline only requires outranking. This asymmetry is intentional—approval opens a refund path, decline does not.
- **Transaction boundary.** The status claim (`claimStatus`) and the order-timeline append (`appendTimeline`) commit atomically. Audit, projection sync, and email run **after** commit, so a failure there does not roll back the decision.
- **Post-commit mail is best-effort.** `notifyDecision` returns `undefined` if the order is missing; the decision itself is already durable.
- **`returnAddress`** is imported from `@modules/shop` (not listed in the immediate graph neighbors) and is passed only on approval, where the customer is asked to ship goods back.
- **`decidedAt`** is stamped with `new Date()` inside the `decide` call and written in the same statement as the status change; `notifyDecision` falls back to `new Date()` if the document's `decidedAt` is somehow unset.
