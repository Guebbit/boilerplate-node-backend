---
source: src/modules/tickets/tests/unit/system-openings.test.ts
sha256: 54fcc721ea61309e1e429882e4a9e9ed2c0cc67a9f3a4ba796a69e3790739dd8
generated_at: 2026-10-29T06:09:56.253019+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/system-openings.test.ts

## Purpose

Unit tests for the pure, side-effect-free opening functions defined in `domain/system.ts`. Each test verifies which ticket `kind`, `link`, and `dueAt` a given situation produces, plus the close shape returned by `clear`. No mocks or database access. The consent-reminder path (16 CFR 435.2) receives the largest coverage block because of its jurisdiction and date-arithmetic rules.

## Key elements

- **`delay()`** – Local factory returning a pre-shaped delay-notice object (`fulfillmentOrderId`, `orderId`, `agreedAt`, `promisedAt`, `shipCountry`) with spread-override support.
- **`FTC`, `AGREED`, `AGREED_PLUS_30`, `NOW`** – Shared date/jurisdiction constants used across blocks.
- **`describe('consentDueOpening …')`** – Table of cases covering: default opening at agreed + 30 d, a new date *beyond* that window, a new date *inside* the grace window (no opening), later slips re-baselining to the new `promisedAt`, missing `promisedAt` (no opening), non-US/PR `shipCountry` (no opening), and `PR` (defined).
- **`describe('the other openings …')`** – Parametrized over `accountReviewOpening`, `refundOwedOpening`, `paidWithoutHoldOpening`, `exportFailedOpening`, `refundRefusedOpening`, `disputeOpening`. Asserts each kind is in `TICKET_KINDS`, has a truthy `routeSetOf`, and that `openKeyOf` produces `kind:linkType:linkId`. Additional rows: dispute `dueAt` fallback, `subjectId` binding for account-tied kinds, and a PII-free message assertion.
- **`describe('clear …')`** – Verifies the exact `{ set, unset }` shape: status `resolved`, resolution `cleared`, `closedAt` stamp, and `openKey` removal.

## Relationships

- **`src/modules/tickets/domain/index.ts`** – Barrel import; supplies all opening functions, `clear`, `openKeyOf`, `routeSetOf`, `TICKET_KINDS`, and the `SystemOpening` type under test.
- **`src/modules/tickets/domain/system.ts`** – Source of every opening function and `clear` exercised here.
- **`src/modules/tickets/domain/routing.ts`** – Provides `routeSetOf`, called to confirm each kind maps to a non-empty route set.
- **`src/modules/tickets/domain/lifecycle.ts`** – Contributes `TICKET_KINDS` (the enum of valid kinds) referenced in assertions.
- **`src/types/index.ts`** – Supplies `TicketKind` and `TicketLinkType` used in expected-value comparisons.

## Notes

- The `delay()` factory defaults `shipCountry` to `'US'`; jurisdiction tests explicitly override to `'DE'`, `undefined`, or `'PR'` to verify the `FTC` list gates the consent path.
- `clear` returns an object with **both** a `set` (fields to write) and an `unset` array (field names to delete). Tests assert the exact shape including `unset: ['openKey']`.
- PII guard: a loop asserts no opening `.message` matches `/@/`—a convention that system-generated messages carry IDs only, never names or addresses.
- The dispute `dueAt` test confirms a two-tier fallback: provider `evidenceDueBy` wins; otherwise the `now` argument is used.
