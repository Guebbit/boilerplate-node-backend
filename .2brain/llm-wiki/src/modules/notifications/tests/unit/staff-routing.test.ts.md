---
source: src/modules/notifications/tests/unit/staff-routing.test.ts
sha256: 001dc90bc118657eb869b635079348e60131d7091a28811b46c72f040cd99a24
generated_at: 2026-11-08T06:37:21.715402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/staff-routing.test.ts

## Purpose

Unit tests for the staff-notification routing layer. Verifies that every project notice has a route with valid permission sets, that email dispatch timing matches urgency, that generated links point to the correct staff pages, that rendered emails carry proper locale text and links, and that access-control helpers behave correctly for each role.

## Key elements

- **`BODIES`** — Fixture map with one valid notice body per routed code (`webhook-disabled`, `task-opened`, `task-overdue`, `task-due-soon`, `task-assigned`, `outbox-dead`).
- **`describe('STAFF_ROUTES')`** — Asserts route-key completeness against `BODIES`, that declared permission sets exist in `PERMISSION_SETS`, and that email timing (`'now'` vs `'none'`) follows the "act-soon" rule.
- **`describe('staffLinkOf')`** — Verifies link generation: task pages for generic tasks, the opener's named work screen when present, webhook subscription page for disabled webhooks, and that `task-assigned` always opens the to-do page.
- **`describe('staffNoticeEmail')`** — Renders emails in `en` and `it`; checks that subject/summary contain no internal code prefix, that the link is locale-prefixed, that contact tasks are labelled by category (or "none"), and that every `TaskKind` has a translation.
- **`describe('setsOfRoute')`** — Confirms fixed routes return their own sets, `per-notice` routes return the caller-supplied list, and an empty list means administrators-only.
- **`describe('callerHoldsAnySet')`** — Validates role-based access: admins see everything, members see only their role's sets, empty set list restricts to admins.

## Relationships

- **`src/modules/notifications/staff-routing.ts`** — Primary module under test; exports `STAFF_ROUTES`, `staffLinkOf`, `setsOfRoute`, `callerHoldsAnySet`.
- **`src/modules/notifications/emails.ts`** — Provides `staffNoticeEmail`, the rendering function exercised in the email tests.
- **`src/kernel/permissions.ts`** — Supplies `PERMISSION_SETS`; tests cross-check that every set named in a route actually exists.
- **`src/infrastructure/http/frontend-link.ts`** — Source of `FRONTEND_LINK_RULES.staffPages`, the canonical staff page templates used as expected link values.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `translator` helper used to fetch locale strings for assertions on email content.
- **`src/types/index.ts`** — `TaskKind` enum; tests iterate its values to confirm a translation exists for each.
- **`tests/support/callers.ts`** — `callerAs` factory used to build role-scoped callers for access-control tests.

## Notes

- `per-notice` routes deliberately carry no sets of their own; the producing module is responsible for supplying them at emission time. An empty set list on such a route means "administrators only."
- The `outbox-dead` notice is excluded from email-rendering tests because it mails nobody and carries no link.
- Tests assert that the internal code prefix `notifications.staff-mail` never leaks into subject lines or summary text — a guard against shipping raw i18n keys to users.
- Link assertions expect a locale-prefixed path (e.g. `/en/tasks/t1`) and URL-encoding of special characters (`o%201`).
