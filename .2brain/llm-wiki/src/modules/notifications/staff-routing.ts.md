---
source: src/modules/notifications/staff-routing.ts
sha256: cfca7cf3cc9ecf1a9f71b24b705845d08ed6ee9c7e9a3f257b50a1c3002b63cf
generated_at: 2026-11-08T06:34:25.728778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/staff-routing.ts

## Purpose

Defines the routing table for the six staff work notices that ship with every project: which permission sets are told, whether the notice earns an email (and of what class), and which frontend screen it links to. It is the single reference for auditing "who is told" for foundation notices. Modules that add their own notices keep their own table and pass it in per call; this file lists none of them.

## Key elements

- **`StaffRoute`** – Interface for one notice's routing: `sets` (permission-set names, `'per-notice'`, or `[]` for admins-only), `email` (`'now' | 'digest' | 'none'`), and `severity`.
- **`StaffLink`** – A frontend page reference: `template` (path, no locale) + `parameters`.
- **`StaffNoticeBody`** – Type guard extracting `NotificationBody` entries whose code matches `` `${string}.staff.${string}` ``.
- **`STAFF_ROUTES`** – `const satisfies Record<FoundationStaffCode, StaffRoute>` mapping the six `notifications.staff.*` codes to their `StaffRoute`. Compile-time guarantee that every foundation code has a route.
- **`setsOfRoute(route, named?)`** – Resolves the effective permission sets: returns `named` for `'per-notice'` routes, otherwise the route's static list. Defaults to `[]` (admins-only) when no sets are named.
- **`staffLinkOf(body)`** – Maps a notice body to its `StaffLink`. Dispatches on code; task-family codes use the internal `taskLink` helper (honors an optional `work` path from the opener). `outbox-dead` is excluded by the parameter type.
- **`callerHoldsAnySet(caller, sets)`** – Returns `true` if the caller is unrestricted or holds at least one of the given permission sets (delegates to `holdsSet`).

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** – Imports `FRONTEND_LINK_RULES.staffPages` as the canonical path templates for staff screens (`PAGES`).
- **`src/kernel/ability.ts`** – Imports `holdsSet`, used inside `callerHoldsAnySet` to check a caller's current role membership.
- **`src/modules/notifications/model.ts`** – Imports `NotificationBody` and `NotificationCode` types used to build `StaffNoticeBody` and `FoundationStaffCode`.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – Source of `NotificationSeverity` and `Caller` types consumed by the route definitions and permission check.
- **`src/modules/notifications/services/staff.ts`** – Downstream consumer that reads `STAFF_ROUTES`, calls `setsOfRoute` and `callerHoldsAnySet` to decide delivery.
- **`src/modules/notifications/services/inbox.ts` / `services/subscribers.ts`** – Sibling services in the same barrel (`services/index.ts`) that use the routing metadata to populate inbox or subscriber channels.
- **`src/shop-tasks/staff-routing.ts`** – A parallel module with its own routing table for shop-task notices; follows the same `StaffRoute` / `StaffLink` shape but is not imported here.
- **`src/modules/notifications/tests/unit/staff-routing.test.ts`** – Unit tests exercising the exports in this file.

## Notes

- **`'per-notice'` sentinel.** When `sets` is the string `'per-notice'`, the caller must supply the actual set names via `setsOfRoute`. An empty `named` array on a `'per-notice'` route resolves to admins-only, not "everyone."
- **Empty array ≠ everyone.** `sets: []` explicitly means *administrators only* (e.g. `outbox-dead`). Do not confuse with the `'per-notice'` default.
- **Email class is a policy, not a toggle.** `'now'` fires one mail per recipient at write time; `'digest'` folds into a daily summary; `'none'` means inbox-bell only. The decision is encoded once in `STAFF_ROUTES` and enforced downstream.
- **`outbox-dead` has no `StaffLink`.** Its code is excluded from `staffLinkOf`'s parameter type; the frontend maps the dead-letter page itself.
- **Contact-message exception.** The comments note that `notifyTaskStaff` (in `services/staff.ts`) suppresses the `'now'` mail for contact-message tasks, making the bell the sole channel. This override lives outside this file.
- **`work` param is opaque.** `taskLink` passes a caller-supplied `work` path through untouched; this module never validates or interprets it.
