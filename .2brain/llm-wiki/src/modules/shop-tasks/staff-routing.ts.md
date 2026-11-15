---
source: src/modules/shop-tasks/staff-routing.ts
sha256: de18fd07e3d5a8e3a4a579826389eedfe2711eeb2a27a63617a713fe8d03c92d
generated_at: 2026-11-14T21:55:02.913874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/staff-routing.ts

## Purpose

Static routing table for shop-task staff notifications: for each work-notice code, it declares which permission-set holders receive it, whether it triggers an email (`now` / `digest` / `none`), and its severity. The data is passed by value to `notificationsService.notifyStaff` on each call; the notifications module stores no persistent copy.

## Key elements

- **`SHOP_STAFF_ROUTES`** (const, `satisfies Record<ShopStaffCode, StaffRoute>`) — The full mapping of 12 shop-staff codes to their `{ sets, email, severity }`. Adding a new `NotificationCode` that matches the `shop-tasks.staff.*` prefix without an entry here is a compile error.
- **`SUMMARY_PAGES`** — Subset of 10 codes whose counts are rewritten by the daily digest, each mapped to its admin listing-page path (pulled from `FRONTEND_LINK_RULES.staffPages`).
- **`SummaryCode`** — Type alias: `keyof typeof SUMMARY_PAGES`.
- **`summaryLinkOf(code)`** — Returns a `StaffLink` (`{ template, parameters: {} }`) pointing at the admin page for a given summary code.
- **`ShopStaffCode`** — Local type: `Extract<NotificationCode, 'shop-tasks.staff.${string}'>`.
- **`PAGES`** — Shorthand for `FRONTEND_LINK_RULES.staffPages`, used inside `SUMMARY_PAGES`.

## Relationships

- **`src/modules/notifications/index.ts`** / **`model.ts`** — Source of the `NotificationCode`, `StaffLink`, and `StaffRoute` type contracts this file satisfies.
- **`src/modules/notifications/staff-routing.ts`** — Sibling routing table for non-shop notification codes; together they form the complete staff-route set.
- **`src/infrastructure/http/frontend-link.ts`** — Exports `FRONTEND_LINK_RULES`; this file reads its `staffPages` property to build `SUMMARY_PAGES`.
- **`src/modules/shop-tasks/services/notices.ts`** — Consumes `SHOP_STAFF_ROUTES` when dispatching a notice to the notifications service.
- **`src/modules/shop-tasks/services/digest.ts`** — Rewrites the counts on the 10 `SUMMARY_PAGES` codes each daily cycle.
- **`src/modules/shop-tasks/services/outcome-unknown.ts`** — The sole consumer of the `'per-notice'` sets value on the `outcome-unknown` code (determines the actual permission set at send time).
- **`src/modules/shop-tasks/emails.ts`** — Reads the `email` field to decide whether to enqueue an email.
- **`src/types/index.ts`** — Source of the `NotificationSeverity` enum.
- **`src/modules/shop-tasks/tests/unit/staff-routing.test.ts`** — Unit tests asserting route completeness and correctness.

## Notes

- **`outcome-unknown` special case:** its `sets` value is the string literal `'per-notice'` rather than an array, meaning the actual permission set is chosen at send-time by the `outcome-unknown` service based on which action (refund, ship, stock move) went silent.
- **Compile-time exhaustiveness:** `satisfies Record<ShopStaffCode, StaffRoute>` on `SHOP_STAFF_ROUTES` means the type system enforces that every shop-staff code has exactly one route entry. Forgetting one breaks the build.
- **Email policy is binary at the transport level:** only `'now'` sends an immediate email; `'digest'` bundles into the daily digest email; `'none'` is in-app bell only.
