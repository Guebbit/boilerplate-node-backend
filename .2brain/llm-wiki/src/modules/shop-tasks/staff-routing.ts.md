---
source: src/modules/shop-tasks/staff-routing.ts
sha256: 1235e77f1413385ad69fe4da8e22f78a8714450d6b4a33b7af79084d4198c0f7
generated_at: 2026-11-08T08:17:38.961693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/staff-routing.ts

## Purpose

Pure data module that defines the routing table for every shop staff work notice: which permission-set holders receive it, whether it triggers an immediate email, and what severity level it carries. The routing objects are handed directly to `notificationsService.notifyStaff` at call time; the `notifications` module stores no persistent copy of these mappings.

## Key elements

- **`ShopStaffCode`** (type) — narrows `NotificationCode` to the `shop-tasks.staff.*` namespace this module owns.
- **`PAGES`** (const) — shorthand for `FRONTEND_LINK_RULES.staffPages`; the canonical admin-screen paths in the frontend router.
- **`SHOP_STAFF_ROUTES`** (const export) — maps all 12 staff codes to `{ sets, email, severity }`. Constrained by `satisfies Record<ShopStaffCode, StaffRoute>`, so a missing code is a compile error.
- **`SUMMARY_PAGES`** (const export) — the 10 codes whose counts the daily digest rewrites, each paired with its listing-page path. Constrained as `Partial<Record<…>>`, so the two non-summary codes (`purchase-hold-placed`, `return-requested`) are intentionally absent.
- **`SummaryCode`** (type export) — `keyof typeof SUMMARY_PAGES`; the union of codes that have a digest row.
- **`summaryLinkOf`** (function export) — given a `SummaryCode`, returns a `StaffLink` (`{ template, parameters: {} }`) pointing at the admin page that lists the items that code counts.

## Relationships

- **`src/modules/notifications/model.ts` / `index.ts`** — supplies the `NotificationCode`, `StaffLink`, and `StaffRoute` types that shape every entry in `SHOP_STAFF_ROUTES`.
- **`src/types/index.ts`** — source of `NotificationSeverity` used for the `severity` field on each route.
- **`src/infrastructure/http/frontend-link.ts`** — provides `FRONTEND_LINK_RULES.staffPages`, the sole source of the page paths in `SUMMARY_PAGES`.
- **`src/modules/shop-tasks/services/digest.ts`** — consumes `SUMMARY_PAGES` / `SummaryCode` to build and rewrite the ten count rows in the daily digest (referenced in the module doc-comment).
- **`src/modules/shop-tasks/tests/unit/staff-routing.test.ts`** — unit tests for the routing table and `summaryLinkOf`.

## Notes

- **Email semantics are fixed by the notifications module's contract:** `'now'` = immediate email (urgent action needed), `'digest'` = aggregated into the daily digest, `'none'` = in-app bell only. This file only *selects* among those three; it does not define them.
- **Exhaustiveness is compile-time:** `SHOP_STAFF_ROUTES` must cover every `ShopStaffCode`, but `SUMMARY_PAGES` is explicitly partial. Adding a new code to `ShopStaffCode` will break the build until both the route and (if applicable) the summary entry are added.
- **`summaryLinkOf` always returns empty `parameters`.** If a page later needs query params, the function signature and `StaffLink` usage must change here first.
