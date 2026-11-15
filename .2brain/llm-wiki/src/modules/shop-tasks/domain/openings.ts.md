---
source: src/modules/shop-tasks/domain/openings.ts
sha256: 35a5d930d7ce1ad1cffb8dbbabd3faf80ed2892ac9b4cc4ef3d1388e40203017
generated_at: 2026-11-14T21:50:28.172321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/domain/openings.ts

## Purpose

Pure-data factories that translate a shop event (payment, stock, or delivery) into the first facts of a task — the `ShopOpening`. Each function maps one situation to a kind, a link to the relevant record, the permission set that works it, the staff-facing text, and a due date. The service layer (`tasks`) is responsible for dedup keys and persistence; this file only produces the data.

## Key elements

- **`ShopOpening`** (interface) — Structural subset of `tasks`' `SystemOpening` (minus `work` and `subjectId`). Fields: `kind`, `routeSet`, `link`, `subject`, `message`, `dueAt`, optional `noDueSoon`.
- **`ORPHAN_WINDOW_MS`** (const) — 4 h; how long a paid order without stock may wait.
- **`AWAITING_BANK_MS`** (const) — 75 days; outer limit for a bank dispute decision.
- **`FTC_GRACE_MS`** (const) — 30 days; 16 CFR 435.2 seller delay grace.
- **`FTC_JURISDICTIONS`** (readonly tuple) — `['US','PR','GU','VI','AS','MP']`; jurisdictions where 16 CFR 435 binds.
- **`refundOwedOpening`** — Manual (hand-recorded) refund that must be sent back outside the app.
- **`amountMismatchOpening`** — Provider success that is not the order's frozen payment; routed to `AuditDisplay`.
- **`paidWithoutHoldOpening`** — Paid order with no stock set aside; due `now + 4 h`.
- **`LegalDeadline`** (interface) — Pairs a `RefundDueRule` with a `YYYY-MM-DD` day in the shop's zone.
- **`refundRefusedOpening`** — Provider permanently refused the refund; includes legal-deadline note.
- **`refundReversedOpening`** — Bank clawed back a settled refund; shop owes the money again.
- **`disputeOpening`** — Buyer's bank opened an inquiry or chargeback; uses provider's `evidenceDueBy` or a fallback.
- **`disputeAwaitingBankOpening`** — Proof sent, waiting on the bank; sets `noDueSoon: true`.
- **`DelayFacts`** (interface) — Fields of a delivery-delay notice used by `consentDueOpening`.
- **`consentDueOpening`** — FTC 16 CFR 435.2(b) consent reminder. Returns `ShopOpening | undefined` (undefined when no consent is owed or the shipment is outside FTC jurisdiction).
- **`legalDeadlineNote`** (private) — Formats the legal-deadline sentence appended to refund messages.
- **`bindsThisShipment`** (private) — Checks whether the FTC rule applies given shop and ship countries.

## Relationships

- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` and `HOUR_MS` to build the duration constants.
- **`src/types/index.ts`** — Imports `RefundDueRule`, `TaskKind`, `TaskLinkType` for the `ShopOpening` field types.
- **`src/modules/shop-tasks/services/tasks.ts`** — Consumes the `ShopOpening` objects returned by these factories; structurally extends them with `work` and `subjectId` before persisting.
- **`src/modules/shop-tasks/domain/index.ts`** — Barrel file that re-exports this module's public API.
- **`src/modules/shop-tasks/tests/unit/openings.test.ts`** — Unit tests exercising each factory's output shape, due-date math, and edge cases where `consentDueOpening` returns `undefined`.

## Notes

- Domain files are forbidden from importing a sibling module, so `ShopOpening` is re-declared here structurally rather than imported from `tasks`. The compiler verifies the match when the service consumes it.
- `consentDueOpening` is the only factory that can return `undefined`; callers must guard before using the result.
- Staff-facing texts are English and reference record IDs only — never names, addresses, or free-form labels. The linked record carries the rest.
- `noDueSoon: true` suppresses the "due soon" reminder; currently only `disputeAwaitingBankOpening` sets it.
- `FTC_JURISDICTIONS` is an `as const` tuple — iterate with `.some()`, do not mutate.
