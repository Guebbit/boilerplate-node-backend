---
source: src/modules/tickets/domain/system.ts
sha256: 9b9b1eda1d91714f7e9e04bf8c99456fcd7c724f7002cfe8d49bda5065d111bf
generated_at: 2026-10-29T06:03:07.821398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/system.ts

## Purpose

Pure-data factory functions that turn a specific system event (a flagged account, a failed export, a dispute, a delay notice, etc.) into the **first facts** of a system ticket: its kind, linked record, inbox text, and due date. This file deliberately stops at "what to say and when it's due"; dedup, routing, and persistence belong to the service layer.

## Key elements

- **`SystemOpening`** (interface) — the shape every factory returns: `kind`, `link`, optional `subjectId`, `subject`, `message`, `dueAt`.
- **`DelayFacts`** (interface) — input record for the delay/consent scenario (agreed date, held date, expected date, ship country).
- **`accountReviewOpening(userId, now)`** — ticket for an account flagged by shop rules; due in 72 h.
- **`refundOwedOpening(refund, dueAt)`** — ticket for a hand-paid refund that must be sent outside the app.
- **`amountMismatchOpening(payment, dueAt)`** — ticket for a provider success that doesn't match the order's payment.
- **`paidWithoutHoldOpening(orderId, now)`** — ticket for a paid order with no stock held; due in 4 h.
- **`exportFailedOpening(failure, now)`** — ticket for a failed data export; due in 72 h.
- **`refundRefusedOpening(refund, dueAt)`** — ticket for a permanently refused provider refund.
- **`disputeOpening(dispute, fallbackDueAt)`** — ticket for a bank-initiated inquiry/chargeback; uses the provider's `evidenceDueBy` when present, otherwise falls back.
- **`consentDueOpening(delay, ftcCountries)`** — ticket (or `undefined`) when a delay notice triggers a buyer-consent obligation under 16 CFR 435.2(b). Encapsulates the 30-day FTC grace and the "no-date-yet" guard.
- **Constants** — `REVIEW_WINDOW_MS` (72 h), `ORPHAN_WINDOW_MS` (4 h), `FTC_GRACE_MS` (30 d).

## Relationships

- **Imports** `TicketKind` and `TicketLinkType` from `@types` (`src/types/index.ts`).
- **Re-exported** through `src/modules/tickets/domain/index.ts`, which is the public entry point for the tickets domain.
- **Consumed by** `src/modules/tickets/services/system.ts`, which decides *when* each factory fires, applies dedup, sets routes, and performs the write.
- **Covered by** `src/modules/tickets/tests/unit/system-openings.test.ts`.

## Notes

- **Pure functions, no I/O.** No database calls, no message emission, no dedup logic. The service layer owns all side effects.
- **Texts carry IDs only.** `subject` and `message` reference record IDs, never names or addresses, because they land in every staff member's inbox.
- **`consentDueOpening` may return `undefined`** (not an empty object) when no consent is owed — callers must handle the optional return.
- **Two timing patterns:** some factories take `now: Date` and compute `dueAt` internally; others accept a pre-computed `dueAt`. The caller is responsible for choosing which applies.
- **`subjectId` is optional** — present only for account-scoped situations (review, export) where the export/erasure workflow follows the person.
