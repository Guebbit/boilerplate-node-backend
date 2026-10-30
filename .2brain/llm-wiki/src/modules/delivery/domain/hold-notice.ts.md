---
source: src/modules/delivery/domain/hold-notice.ts
sha256: 9e6b91450d2cb9cd3e6a377bcea0cd146f5b3b2ddae9d4e02a71eeeea8d0102d
generated_at: 2026-10-29T03:32:58.190844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/hold-notice.ts

## Purpose

Pure domain logic that translates an internal fulfillment-hold reason into a buyer-safe notice and decides whether that hold warrants a buyer notification (email + inbox row). It exists to enforce a security boundary: staff-side reasons (especially risk screening) must never leak through the buyer-facing message, while still giving the buyer actionable information when one applies (e.g. fixing an address).

## Key elements

- **`holdNoticeOf(reason: FulfillmentHoldReason): FulfillmentHoldNotice`** — Maps the stored reason to one of three buyer-visible notices: `awaiting_stock` → `awaiting_stock`, `incorrect_address` → `check_address`, `high_risk` / `other` → `delayed`. Risk and "other" are intentionally indistinguishable.
- **`holdNeedsBuyerNotice(reason, message): boolean`** — Returns `true` when the hold should produce a mail and an inbox entry. Logic: always `false` for `awaiting_stock`; otherwise `true` for `incorrect_address` or when staff supplied a `message`; `false` for a bare `high_risk`/`other` with no message.

## Relationships

- **`src/types/index.ts`** — Provides the `FulfillmentHoldReason` and `FulfillmentHoldNotice` enums used as both input and output types.
- **`src/modules/delivery/domain/index.ts`** — Barrel file that re-exports the two functions so the rest of the delivery module can import them via the domain namespace.
- **`src/modules/delivery/presenter.ts`** — Consumes `holdNoticeOf` to shape the notice string shown to the buyer in the UI.
- **`src/modules/delivery/services/announce.ts`** — Consumes `holdNeedsBuyerNotice` to gate the creation of an outbound email and an inbox row.
- **`src/modules/delivery/tests/unit/hold-notice.test.ts`** — Unit tests covering both exported functions.

## Notes

- This module is intentionally pure (no I/O, no side effects) so the mapping and gating logic can be tested in isolation and reasoned about without runtime context.
- The `awaiting_stock` exclusion in `holdNeedsBuyerNotice` is deliberate: preorder-group creation also produces a hold, and mailing the buyer at that point would be noise.
- `high_risk` and `other` collapse to the same `delayed` notice by design — the docstring references Shopify's admin-only hold reasons and Kount/Riskified guidance as the rationale. Treat the three-way split as a security invariant, not a simplification.
