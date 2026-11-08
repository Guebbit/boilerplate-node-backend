---
source: src/modules/shop-tasks/tests/unit/staff-routing.test.ts
sha256: 3a6ac1b08e9e12f31df541b786aafcf69feb4d6014744a3fd00e5ec4eb3bade0
generated_at: 2026-11-08T08:19:58.981934+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/unit/staff-routing.test.ts

## Purpose
Unit tests for the shop-staff routing module. Verifies that every route code references permission sets that actually exist in the kernel, that the ten summary codes resolve to the correct frontend screen paths, and that both the single-notice and digest emails render localized text with correct links in every served language.

## Key elements
- **`describe('SHOP_STAFF_ROUTES')`** — Parameterized over all 12 route codes; asserts each code's `sets` array is a subset of `PERMISSION_SETS`. Also pins the email urgency field (`'now'` vs `'none'`) for two representative codes and asserts the total code/page counts (12 / 10).
- **`describe('summaryLinkOf')`** — Parameterized over all 10 summary codes; asserts `summaryLinkOf(code)` returns `{ template: <expected path>, parameters: {} }` using `FRONTEND_LINK_RULES.staffPages` as the source of truth.
- **`describe('the mails')`** — Exercises `staffNoticeEmail` (single purchase-hold notice) and `staffDigestEmail` (10-line digest) in `en` and `it`. Checks: no raw i18n keys leak into subject/summary/text, links are locale-prefixed (`/{locale}/…`), digest line count equals 10, and `JSON.stringify(mail)` contains no `@` (no stray email addresses).

## Relationships
- **`src/modules/shop-tasks/staff-routing.ts`** — The module under test; supplies `SHOP_STAFF_ROUTES`, `SUMMARY_PAGES`, and `summaryLinkOf`.
- **`src/modules/shop-tasks/emails.ts`** — Provides `staffDigestEmail`, used in the digest test block.
- **`src/modules/notifications/index.ts`** — Provides `staffNoticeEmail`, used in the single-notice test block.
- **`src/kernel/permissions.ts`** — Supplies `PERMISSION_SETS`, the authoritative list of permission-set names that routes must reference.
- **`src/infrastructure/http/frontend-link.ts`** — Supplies `FRONTEND_LINK_RULES.staffPages` (`PAGES`), the canonical frontend screen paths used as expected values for link assertions.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Supplies `translator`, used to fetch the expected digest subject string by key.

## Notes
- The hard-coded counts (`toHaveLength(12)` for codes, `toHaveLength(10)` for summary pages) are a deliberate guard: adding or removing a route code without updating `SUMMARY_PAGES` (or vice-versa) will fail here.
- The assertion `expect(JSON.stringify(mail)).not.toMatch(/@/)` is a leak-prevention check ensuring no email addresses are serialized into the mail payload.
- `PAGES` is imported from `FRONTEND_LINK_RULES.staffPages`, not re-declared — the test and the routing module share the same source of truth for screen paths, so a path rename in the frontend-link config will shift both sides in lockstep.
