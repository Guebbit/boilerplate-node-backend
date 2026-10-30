---
source: src/modules/notifications/tests/unit/staff-routing.test.ts
sha256: 54ddc2151b25c8804af73de53f274e74310bbcabd883877b7c823153dbd4815f
generated_at: 2026-10-29T04:34:43.963566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/staff-routing.test.ts

## Purpose

Unit tests for the staff work-notice routing subsystem. They verify that every notification code has a route with valid permission sets, that `staffLinkOf` resolves the correct URL template per notice, that `staffNoticeEmail` produces translated, PII-free output in every served locale, and that role-based visibility (`callerHoldsAnySet`, `setsOfRoute`) behaves correctly for admins, moderators, and managers.

## Key elements

- **`BODIES`** – A `Record` keyed by every `STAFF_NOTIFICATION_CODES` value, holding one valid `StaffNoticeBody` fixture per code. Acts as the canonical test corpus for link and email assertions.
- **`describe('STAFF_ROUTES')`** – Asserts route completeness (every code is routed), that declared permission-set names exist in `PERMISSION_SETS`, and that email urgency (`'now'` vs `'none'`) matches business intent.
- **`describe('staffLinkOf')`** – Checks URL template + parameter resolution for tickets, user holds, webhook subscriptions, returns, and the context-sensitive `outbox-dead` case (order, user, or empty).
- **`describe('staffNoticeEmail')`** – Verifies subject/body translation for `en` and `it`, correct ticket-category/kind labelling, the "uncategorised" fallback, i18n completeness across all `TICKET_KINDS`, and absence of PII (no `@`, no names) in serialized output.
- **`describe('setsOfRoute')`** – Tests extraction of permission sets from both fixed routes and `per-notice` routes (including the empty-set admin-only case).
- **`describe('callerHoldsAnySet')`** – Confirms that admins pass any set check, role members pass only their listed sets, and an empty set list is admin-exclusive.

## Relationships

- **`@modules/notifications/staff-routing`** – The module under test; all exported symbols (`STAFF_ROUTES`, `staffLinkOf`, `staffNoticeEmail`, `setsOfRoute`, `callerHoldsAnySet`, `StaffNoticeBody`) are exercised here.
- **`@modules/notifications/model`** – Supplies `STAFF_NOTIFICATION_CODES`, the closed set that the routing table and `BODIES` fixture must cover exhaustively.
- **`@modules/notifications/emails`** – Source of `staffNoticeEmail`, whose output (subject, summary, link) is asserted in the email test blocks.
- **`@kernel/permissions`** – Provides `PERMISSION_SETS`; the test cross-references route-declared set names against this registry.
- **`@modules/tickets`** – Exports `TICKET_KINDS`, iterated to confirm every kind has a translation key in each locale.
- **`@infrastructure/i18n`** – Exports `translator`, used to look up expected localized strings for ticket categories and kinds.
- **`tests/support/callers`** – Provides the `callerAs(role)` factory that mints fake callers with role-specific permission sets for the visibility tests.

## Notes

- **`BODIES` is a completeness contract.** Adding a new entry to `STAFF_NOTIFICATION_CODES` will cause a TypeScript error here until a matching body is added — by design, this forces the author to define a valid fixture immediately.
- **`per-notice` routes carry no sets of their own.** The test explicitly skips set-validation for those entries; the sets are supplied at the call site via `setsOfRoute(route, namedSets)`.
- **`outbox-dead` link is polymorphic.** It resolves to `orders/{id}`, `users/{id}`, or an empty template depending on the `aggregateId` prefix. Tests cover all three branches.
- **PII guard is structural, not semantic.** The test only asserts that `JSON.stringify(mail)` contains no `@`; it does not parse individual fields.
