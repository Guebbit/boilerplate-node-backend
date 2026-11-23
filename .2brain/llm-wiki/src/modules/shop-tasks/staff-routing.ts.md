---
source: src/modules/shop-tasks/staff-routing.ts
source_sha256: c9d2b679e9846e570e7e01317e346f521319b1ef3b84ba7d07360aecdc49d4f2
context_sha256: e4ab7b38c0d76c36c20014ae7ebd21fb7e81b790aaf53dd3cf740c9b02882e30
generated_at: 2026-11-22T07:44:04.410367+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/staff-routing.ts

## Purpose
Declares who is notified about work notices that only a shop sends: which permission sets receive each notice, whether it is worth an email, its severity, and which admin page the notice points to. The routing is plain data passed to `notificationsService.notifyStaff` with each call. The `notifications` module keeps no table of these routes.

## Key elements
- `SHOP_STAFF_ROUTES`: maps every `shop-tasks.staff.*` notification code to a `StaffRoute` (`sets`, `email`, `severity`). It uses `as const satisfies Record<ShopStaffCode, StaffRoute>`, so a code missing from the map fails to compile.
  - Individual notices: `purchase-hold-placed` (UserBanning, email `now`, warning), `return-requested` (ReturnManagement, `none`, info), `outcome-unknown` (`sets: 'per-notice'`, `now`, error).
  - Summary rows: `transfers-due`, `preorders-late`, `delivery-holds-open`, `returns-awaiting-goods`, `returns-undecided`, `low-stock`, `unshipped`, `awaiting-tracking`, `undelivered`, `stale-refunds`.
- `SUMMARY_PAGES`: maps each of the ten summary codes to its staff page template, taken from `FRONTEND_LINK_RULES.staffPages`.
- `SummaryCode`: the type of the keys of `SUMMARY_PAGES`.
- `summaryLinkOf(code)`: returns a `StaffLink` with `template` set to the summary's page and empty `parameters`.

## Relationships
- Imports `FRONTEND_LINK_RULES` from `src/infrastructure/http/frontend-link.ts` for the shared `staffPages` paths.
- Imports `NotificationSeverity` from `src/types/index.ts`.
- Imports the `NotificationCode`, `StaffLink` and `StaffRoute` types from `src/modules/notifications/index.ts`; `src/modules/notifications/model.ts` and `src/modules/notifications/staff-routing.ts` sit alongside it in the graph. The mail rule is the one `notifications` states.
- Its sibling files in `shop-tasks` (`src/modules/shop-tasks/emails.ts`, `src/modules/shop-tasks/services/digest.ts`, `src/modules/shop-tasks/services/notices.ts`, `src/modules/shop-tasks/services/outcome-unknown.ts`) sit next to it in the graph, and `src/modules/shop-tasks/tests/unit/staff-routing.test.ts` is its unit test. The digest rewrites the summary counts. The file's doc comment says routing is handed to `notifyStaff`, but the call sites are not visible here.

## Notes
- Email levels:
  - `now`: someone must act soon.
  - `digest`: an overdue count is mailed once per run.
  - `none`: the bell only.
- Only the overdue summary rows use `digest`. Counts of work in the normal course (`transfers-due`, `low-stock`, `awaiting-tracking`) use `none`.
- `outcome-unknown` uses `sets: 'per-notice'` instead of a fixed permission list. Its recipients are not fixed in this file.
- `SUMMARY_PAGES` is typed `satisfies Partial<Record<ShopStaffCode, string>>`, so it needs no entry for `purchase-hold-placed`, `return-requested` or `outcome-unknown`.
