---
source: src/modules/notifications/tests/unit/staff-routing.test.ts
source_sha256: f8c665ea7588084cd220701a0dfc5ad857332d0151c7e6d5a70e4964e638fcdd
context_sha256: 550104903069bfb73e558bc6c024e8a893bc15eb2caa4f68f16cca11c05e8a1d
generated_at: 2026-11-22T05:59:34.337908+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/staff-routing.test.ts

## Purpose
Unit tests that audit the staff notification routing table: every work notice code every project has gets a route, routes name real permission sets, and notices that mail have translated wording in every served language (`en`, `it`). It also covers link resolution and caller visibility helpers.

## Key elements
- **`PAGES`** — alias for `FRONTEND_LINK_RULES.staffPages`, the shared staff screen paths links are compared against.
- **`BODIES`** — one valid notice body per routed code: `webhook-disabled`, `task-opened`, `task-overdue`, `task-due-soon`, `task-assigned`, `outbox-dead`.
- **`STAFF_ROUTES` tests**
  - The route keys must equal the `BODIES` keys.
  - Every named permission set must exist in `PERMISSION_SETS`; `per-notice` routes are skipped.
  - `task-opened`, `task-due-soon` and `task-overdue` mail `now`, and the latter two share the opener's `sets`. `webhook-disabled` mails `none`.
- **`staffLinkOf` tests**
  - Task notices link to the task page (`PAGES.task`, `tasks/{id}`).
  - A `work` param on `task-opened` or `task-overdue` overrides that and links to the named screen with empty parameters.
  - `task-assigned` always links to the task page.
  - A disabled webhook links to `PAGES.webhookSubscription` with the subscription id.
- **`staffNoticeEmail` tests**
  - Every mailing code has subject and summary text in `en` and `it`, with no untranslated `notifications.staff-mail` keys leaking through. The link ends in `/<locale>/tasks/t1`.
  - It uses the link passed in; a parameter such as `o 1` is URL-encoded to `o%201`.
  - A contact task is named by its translated category (`tasks.task-category.privacy`). A task with no category gets `tasks.task-category.none`.
  - Every `TaskKind` has a `tasks.task-kind.*` label in both languages.
- **`setsOfRoute` tests**
  - A fixed route returns its own sets (`webhook-disabled` gives `['WebhookManagement']`).
  - A `per-notice` route returns the sets passed in, or `[]` if none are given.
- **`callerHoldsAnySet` tests**
  - An admin sees everything, including an empty set list.
  - Other roles (`moderator`, `manager`) see a notice only if their role lists one of its sets.
  - An empty list is visible to administrators alone.

## Relationships
- Tests `STAFF_ROUTES`, `staffLinkOf`, `setsOfRoute` and `callerHoldsAnySet` from `staff-routing.ts`, and `staffNoticeEmail` from `emails.ts`.
- Reads `PERMISSION_SETS` from `@kernel/permissions` to validate the set names.
- Uses `FRONTEND_LINK_RULES` from `frontend-link.ts` for the expected link templates.
- Uses `translator` from the i18n module to look up the expected wording.
- Uses `TaskKind` from `@types` to iterate the task kinds.
- Uses `callerAs` from `tests/support/callers.ts` to build callers with a given role.

## Notes
- The mailing-language loop skips routes whose `email` is not `now` and the `outbox-dead` notice, which mails nobody and has no link.
- The `BODIES` keys act as the list of expected routes, so adding a notice code requires updating both `STAFF_ROUTES` and `BODIES`.
