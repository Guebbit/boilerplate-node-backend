---
source: src/modules/notifications/staff-routing.ts
source_sha256: 80fd27db72d1ef3f8b95df851bba180928a3f5fb225f10615df53e1c70c2b3d1
context_sha256: d3bbaf9ddcaeaaa13dd3f02bbc3a1ca032d7ee0cfe166c160025370314ef5ddb
generated_at: 2026-11-22T05:56:51.185530+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/staff-routing.ts

## Purpose
Central routing table for "work notices" sent to staff: which permission sets are told, whether the notice is mailed, how severe it is, and which frontend page it links to. It exists so "who is told" for the notices every project has can be audited in one file. Modules with their own notices keep their own table and pass it in per call; this file lists none of theirs.

## Key elements
- `StaffRoute`: routing shape: `sets` (permission set names, or `'per-notice'` when the producer names them), `email` (`'now' | 'digest' | 'none'`), and `severity`.
- `StaffLink`: a frontend page as a path `template` (no locale) plus `parameters` for its placeholders.
- `StaffNoticeBody`: the `NotificationBody` variants whose code matches `<module>.staff.<name>`.
- `STAFF_ROUTES`: the six built-in notices, typed `satisfies Record<FoundationStaffCode, StaffRoute>` so a missing code fails compilation:
  - `webhook-disabled`: `WebhookManagement` set, no email, warning.
  - `task-opened`: per-notice, email now, info.
  - `task-overdue`: per-notice, email now, warning.
  - `task-due-soon`: per-notice, email now, info.
  - `task-assigned`: per-notice, no email, info.
  - `outbox-dead`: empty sets (administrators only), no email, error.
- `setsOfRoute(route, named)`: returns the route's sets, or the producer's `named` sets for a `per-notice` route. With none named, the result is empty, meaning administrators only, never everyone.
- `staffLinkOf(body)`: maps a notice body to a `StaffLink`. Webhook-disabled goes to the webhook subscription page. Task-opened, task-overdue and task-due-soon go to the opener's `work` path if given, otherwise to the task page. Task-assigned always goes to the task page. `outbox-dead` is excluded from its type.
- `callerHoldsAnySet(caller, sets)`: true if the caller is `unrestricted` or holds any of the sets, evaluated at call time.

## Relationships
- Reads the staff page templates from `FRONTEND_LINK_RULES` in `src/infrastructure/http/frontend-link.ts`.
- Uses `holdsSet` from `src/kernel/ability.ts` for permission checks.
- Takes `NotificationBody` and `NotificationCode` types from `src/modules/notifications/model.ts`, and `Caller` and `NotificationSeverity` from `src/types/index.ts` (the `@types` alias).
- Per its docs, other modules supply their own routing tables with each call. `src/modules/shop-tasks/staff-routing.ts` is a sibling in the graph, presumably one such table.
- The notifications services (`src/modules/notifications/services/staff.ts`, `inbox.ts`, `subscribers.ts`, `index.ts`) and `src/modules/notifications/emails.ts` are graph neighbors, and `src/modules/notifications/tests/unit/staff-routing.test.ts` covers this file.

## Notes
- Mail rule: `now` only where someone must act soon (money, a legal clock, security). Everything else is inbox-only.
- For contact messages, the file's comments say `notifyTaskStaff` makes `task-opened` and `task-overdue` bell-only, with the mail going to the main mailbox instead. That logic is not in this file.
- An empty `sets` list means administrators only.
- `digest` is part of the `email` type, but no built-in route uses it.
- Because the check runs when the caller asks, a member who loses a role stops seeing the notice.
