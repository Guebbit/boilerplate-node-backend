---
source: src/modules/shop-tasks/tests/unit/staff-routing.test.ts
sha256: 89e2d4764c5b4079eb62cf33a2eae92fc971c5762b083fbeb85755723bf4e072
generated_at: 2026-11-14T21:59:14.473168+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/unit/staff-routing.test.ts

## Purpose

Unit tests for the shop's staff-notification routing: verifies that every declared route names real permission sets, that the ten summary codes link to the correct frontend pages, that notice/digest emails render fully translated (no leaked template keys, no raw `@` characters), and that email urgency is assigned only where staff must act immediately.

## Key elements

- **`PAGES`** – alias for `FRONTEND_LINK_RULES.staffPages`; the canonical screen paths used as comparison targets for link assertions.
- **`CODES`** – the full array of keys in `SHOP_STAFF_ROUTES` (13 entries: 3 "announced", 10 "counted").
- **`describe('SHOP_STAFF_ROUTES')`** – validates that non-`per-notice` routes reference only sets present in `PERMISSION_SETS`; asserts email timing (`'now'` for purchase-hold / outcome-unknown, `'none'` for return-requested); asserts the 13-code / 10-summary invariant.
- **`describe('summaryLinkOf')`** – table-driven check (10 cases) that `summaryLinkOf(code)` returns `{ template: PAGES[<key>], parameters: {} }`.
- **`describe('the mails')`** – exercises `staffNoticeEmail` and `staffDigestEmail` in `en` and `it`: confirms rendered subject/summary contain no raw i18n key, links end with the correct locale-prefixed path, digest has exactly 10 lines each linking to its screen, and the serialized JSON contains no `@`.

## Relationships

- **`src/modules/shop-tasks/staff-routing.ts`** – the module under test; supplies `SHOP_STAFF_ROUTES`, `SUMMARY_PAGES`, and `summaryLinkOf`.
- **`src/kernel/permissions.ts`** – provides `PERMISSION_SETS`; the test cross-checks route declarations against this vocabulary.
- **`src/infrastructure/http/frontend-link.ts`** – provides `FRONTEND_LINK_RULES` (the test reads `.staffPages` from it); the ground-truth screen paths for link and email assertions.
- **`src/modules/notifications/index.ts`** (→ `src/modules/notifications/emails.ts`) – re-exports `staffNoticeEmail`, the per-notice mail builder tested for content and links.
- **`src/modules/shop-tasks/emails.ts`** – exports `staffDigestEmail`, the 10-line digest builder tested for i18n completeness and per-line links.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – exports `translator`, used to assert the digest subject matches the catalog entry for the active locale.

## Notes

- `'per-notice'` is a sentinel value in `sets` meaning the route delegates permission naming to its producer; the test skips the set-existence check for those entries.
- The locale list is hardcoded to `['en', 'it']`. Adding a new served locale requires extending it here or the digest/notice i18n coverage silently narrows.
- The `@` assertion (`JSON.stringify(mail)`) is a guard against leaking raw email addresses into template output—intentionally broad, applied to the entire serialized mail.
- The test imports `staffNoticeEmail` via the `@modules/notifications` barrel rather than directly from `emails.ts`, so a re-export change in that barrel will break this file.
