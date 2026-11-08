---
source: src/modules/shop-tasks/domain/openings.ts
sha256: f9599fe7ff4dcbdcc48c48d0acd6f8bd0e1730ffb7d0b8f71ce35a239d24c36c
generated_at: 2026-11-08T08:14:33.338157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/domain/openings.ts

## Purpose

Pure-data factory functions that translate a payment, stock, or delivery event into the first facts of a shop task (kind, responsible permission set, linked record, inbox text, due date). This file produces the `ShopOpening` shape; it does not deduplicate, persist, or render — that is `tasks`' job. It exists so the domain layer can describe *what* a situation demands without coupling to the service layer that *writes* it.

## Key elements

- **`ShopOpening`** (interface) — The structural contract: `kind`, `routeSet`, `link`, `subject`, `message`, `dueAt`, optional `noDueSoon`. Declared locally because a domain file may not import a sibling module; the compiler checks compatibility when `tasks` receives it.
- **`FTC_JURISDICTIONS`** (exported const) — Country codes (`US`, `PR`, `GU`, `VI`, `AS`, `MP`) where 16 CFR 435.2 binds the seller.
- **`DelayFacts`** (exported interface) — Input shape for the consent-delay logic (fulfillment order, order, agreed/promised/expected dates, ship country).
- **`refundOwedOpening`** — Manual refund owed; routes to `PaymentRefunding`.
- **`amountMismatchOpening`** — Provider success not tied to the order's frozen payment; routes to `AuditDisplay` (admins only).
- **`paidWithoutHoldOpening`** — Paid order with no stock set aside; 4-hour window; routes to `InventoryManagement`.
- **`refundRefusedOpening`** — Provider permanently refused a refund; routes to `PaymentRefunding`.
- **`refundReversedOpening`** — Bank returned a settled refund; routes to `PaymentRefunding`.
- **`disputeOpening`** — Buyer's bank opened a dispute; uses provider's `evidenceDueBy` or a fallback date.
- **`disputeAwaitingBankOpening`** — Post-evidence wait; sets `noDueSoon: true` (75-day outer limit).
- **`consentDueOpening`** — FTC 16 CFR 435.2 consent reminder; returns `ShopOpening | undefined` (undefined when no consent is owed or the buyer was already told "no date yet").
- **`bindsThisShipment`** (private) — Checks whether the shop's country or the ship country is in `FTC_JURISDICTIONS`.
- Private constants: `ORPHAN_WINDOW_MS` (4 h), `AWAITING_BANK_MS` (75 d), `FTC_GRACE_MS` (30 d).

## Relationships

- **`src/domain-primitives/time.ts`** — Provides `DAY_MS` and `HOUR_MS` used to compute the three due-date windows.
- **`src/modules/shop-tasks/services/tasks.ts`** — Consumes `ShopOpening`; adds the staff screen and the dedup/write logic that this file explicitly defers.
- **`src/modules/shop-tasks/domain/index.ts`** — Barrel re-export for the domain layer; external code imports openings through it rather than reaching into the file directly.
- **`src/types/index.ts`** — Source of `TaskKind` and `TaskLinkType` enums used in every opening's `kind` and `link` fields.
- **`src/modules/shop-tasks/tests/unit/openings.test.ts`** — Unit tests covering the factory functions and the `consentDueOpening` decision table.

## Notes

- **No names or addresses in text.** `subject` and `message` embed record IDs only; the linked record (fetched via `link`) carries the human-readable details. This is a deliberate convention — the inbox line is shared across all holders of the permission set.
- **`consentDueOpening` is the only factory that can return `undefined`.** Callers must guard for that case (no task is opened).
- **`noDueSoon` is a literal `true`, not a boolean.** It signals "suppress the due-soon reminder" and is only set on `disputeAwaitingBankOpening`.
- **Domain-file isolation rule.** `ShopOpening` is re-declared here structurally rather than imported from `tasks` because a domain file must not import a sibling module. The service layer is responsible for the compiler-level structural check.
- **`consentDueOpening` jurisdiction check is inclusive.** If *either* the shop's country *or* the ship destination is in `FTC_JURISDICTIONS`, the rule binds — even for a non-US shop shipping to a US buyer.
