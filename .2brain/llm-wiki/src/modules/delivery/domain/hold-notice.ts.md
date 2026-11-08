---
source: src/modules/delivery/domain/hold-notice.ts
sha256: 9e6b91450d2cb9cd3e6a377bcea0cd146f5b3b2ddae9d4e02a71eeeea8d0102d
generated_at: 2026-11-08T05:28:27.950729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/hold-notice.ts

## Purpose

Maps an internal `FulfillmentHoldReason` to the buyer-safe notice string and decides whether the hold warrants a buyer notification (mail + inbox row). The mapping deliberately collapses risk-related and "other" holds into a generic "delayed" notice so that the screening rationale is never exposed to the buyer, while still surfacing actionable states (address correction, stock waiting).

## Key elements

- **`holdNoticeOf(reason): FulfillmentHoldNotice`** — Pure lookup: `awaiting_stock` → `awaiting_stock`, `incorrect_address` → `check_address`, everything else (`high_risk`, `other`) → `delayed`.
- **`holdNeedsBuyerNotice(reason, message): boolean`** — Returns `true` when the buyer gets something to act on or read: an address problem, *or* any non-`awaiting_stock` hold that carries a staff-written message. A bare `delayed` with no message returns `false`; `awaiting_stock` always returns `false`.

## Relationships

- **`src/types/index.ts`** — Source of the `FulfillmentHoldNotice` and `FulfillmentHoldReason` enums used as the function's contract.
- **`src/modules/delivery/domain/index.ts`** — Barrel file that re-exports these functions so other modules import from the domain namespace.
- **`src/modules/delivery/presenter.ts`** — Consumes `holdNoticeOf` to render the buyer-facing hold text in delivery views.
- **`src/modules/delivery/services/announce.ts`** — Calls `holdNeedsBuyerNotice` to gate whether an email and inbox row are dispatched for a new hold.
- **`src/modules/delivery/tests/unit/hold-notice.test.ts`** — Unit tests covering both exported functions across all reason/message combinations.

## Notes

- `holdNeedsBuyerNotice` intentionally returns `false` for `awaiting_stock` regardless of any attached message; the docstring notes this is because a preorder group's creation also triggers a hold, and buyers shouldn't be emailed about that.
- The `high_risk` / `other` → `delayed` collapse is a deliberate compliance choice (Shopify, Kount, Riskified guidance; UCPD Art. 6(1)(b)). Treat the mapping as security-sensitive: do not add a distinct notice for `high_risk` without a legal review.
- Both functions are pure and side-effect-free; any I/O (sending mail, writing inbox rows) happens upstream in `announce.ts`.
