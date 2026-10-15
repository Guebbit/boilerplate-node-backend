---
source: src/modules/returns/domain/lifecycle.ts
sha256: 9ad14653dc1d1f32e7747654897ca1401537f9ea723dcda0760cd15a3e14fb06
generated_at: 2026-10-15T11:52:34.028809+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/lifecycle.ts

## Purpose

Defines the return lifecycle: which `ReturnStatus` each write operation may execute **from**. Each exported status array is a closed, membership-checked guard that backs a conditional write in `repository.ts` (`claimStatus`), making concurrent duplicate decisions (e.g. approve + decline) resolve to exactly one winner at the database level.

## Key elements

- **`DECIDABLE_RETURN_STATUSES`** — `[requested]`. The only status from which staff may approve/decline.
- **`RECEIVABLE_RETURN_STATUSES`** — `[approved]`. The only status from which goods may be marked received.
- **`CLOSABLE_RETURN_STATUSES`** — `[received]`. The only status from which a return may be closed (refund issued).
- **`initialStatusFor(reason)`** — Returns `approved` for a `withdrawal` (EU right, no decision needed); `requested` for all other reasons.
- **`QUANTITY_HOLDING_RETURN_STATUSES`** — `[requested, approved, received, closed]`. Statuses whose returns still consume the order line's returnable quantity.
- **`BACK_RETURN_STATUSES`** — `[received, closed]`. Statuses indicating the goods have physically returned.
- **`holdsReturnedGoods({ kind, status })`** — True when `kind === ReturnKind.return` **and** the status is in `QUANTITY_HOLDING_RETURN_STATUSES`. Cancellations never hold goods.
- **Re-exported types** — `ReturnStatus`, `ReturnReason`, `ReturnKind` from `@types` (the closed contracts this table is built on).

## Relationships

- **`src/types/index.ts`** — Source of the three imported enum/type definitions; this file re-exports them for consumers.
- **`src/modules/returns/domain/index.ts`** — Barrel that re-exports this module's symbols to the rest of the domain.
- **`src/modules/returns/services/create.ts`** — Consumes `initialStatusFor` to set the status on a new return record.
- **`src/modules/returns/services/decide.ts`** — Reads `DECIDABLE_RETURN_STATUSES` as the `FROM` clause for the claim.
- **`src/modules/returns/services/receive.ts`** — Reads `RECEIVABLE_RETURN_STATUSES` as the `FROM` clause.
- **`src/modules/returns/services/close.ts`** — Reads `CLOSABLE_RETURN_STATUSES` as the `FROM` clause.
- **`src/modules/returns/domain/accounting.ts`** — Uses `holdsReturnedGoods` / `QUANTITY_HOLDING_RETURN_STATUSES` to compute how many units are still held.
- **`src/modules/returns/domain/refund-amount.ts`** — Uses `BACK_RETURN_STATUSES` to decide whether a delivery refund applies.
- **`src/modules/returns/domain/status-projection.ts`** — Reads the status sets to project order-level state.
- **`src/modules/returns/tests/unit/domain.test.ts`** — Unit-tests the transition table and `initialStatusFor` / `holdsReturnedGoods` logic.

## Notes

- The status arrays are `readonly` and intentionally **single-element** for the write guards. Adding a status to any of them silently widens which concurrent writes can succeed — treat membership as a concurrency-control decision, not just a list.
- `QUANTITY_HOLDING_RETURN_STATUSES` includes `closed`. A closed return still occupies quantity because the goods, though back, were part of a valid return that consumed the line's returnable count. A `declined` return is the only status excluded — it never held goods in the first place.
- `initialStatusFor` is the **only** place that maps a reason to a starting status. All service entry points should call it rather than hard-coding `approved` or `requested`.
