---
source: src/modules/shop-tasks/tests/unit/staff-routing.test.ts
source_sha256: d7d2d49f50e76d7197385599492d43209c47ec1e5ba1cc048e21b9dcd72269cf
context_sha256: bde2c9331edaed759fba5d2be64a0a7c31b7cca7d277e2f75eda11b63de88443
generated_at: 2026-11-22T07:46:30.197178+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/unit/staff-routing.test.ts

## Purpose
Unit tests guarding the shop's staff-notice routing. They check that every work notice the shop writes has a route naming existing permission sets, that the ten summary notices link to the screens that list what they count, and that the staff mails (notice and digest) have their text in every tested language (`en`, `it`).

## Key elements
- `PAGES` — alias for `FRONTEND_LINK_RULES.staffPages`, the shared staff screen paths that links are compared against.
- `CODES` — all keys of `SHOP_STAFF_ROUTES`, so new notice codes are covered automatically without editing the cases.
- `describe('SHOP_STAFF_ROUTES')`:
  - For each code whose `sets` is not `'per-notice'`, asserts every named set exists in `PERMISSION_SETS`. Per-notice routes are skipped because their producer names the set, typed against the vocabulary.
  - Asserts the email policy: `purchase-hold-placed` and `outcome-unknown` are `'now'`; `return-requested` is `'none'`.
  - Asserts there are 13 codes in total (three announced, ten counted) and 10 entries in `SUMMARY_PAGES`.
- `describe('summaryLinkOf')` — a table test mapping each of the ten summary codes (e.g. `transfers-due`, `low-stock`, `stale-refunds`) to `{ template: <page path>, parameters: {} }`.
- `describe('the mails')`, run for `en` and `it`:
  - `staffNoticeEmail` for a purchase hold: no untranslated `shop-tasks.staff-mail` keys in the subject or summary, the link ends in `/<locale>/users/u1`, and the serialized mail contains no `@`.
  - `staffNoticeEmail` for an unknown-outcome write: the subject contains the subject name `2026-000041`, no untranslated keys, and the link ends in `/<locale>/orders/o1`.
  - `staffDigestEmail` fed all ten summary codes with `count: 4`: template is `shop-tasks.staff-digest`, the subject equals the translated `shop-tasks.staff-mail.digest.subject`, there are 10 lines, each containing "4", no raw keys, and a link containing `/<locale>/`.

## Relationships
- `src/modules/shop-tasks/staff-routing.ts` — supplies `SHOP_STAFF_ROUTES`, `SUMMARY_PAGES` and `summaryLinkOf`, which are the subject of the tests.
- `src/modules/shop-tasks/emails.ts` — supplies `staffDigestEmail`.
- `src/modules/notifications/index.ts` — supplies `staffNoticeEmail`, the generic notice mail builder.
- `src/kernel/permissions.ts` — supplies `PERMISSION_SETS`, the vocabulary route sets are validated against.
- `src/infrastructure/http/frontend-link.ts` — supplies `FRONTEND_LINK_RULES`, whose `staffPages` paths are the expected link targets.
- `src/infrastructure/i18n/index.ts` — supplies `translator`, used to compute the expected digest subject.

## Notes
- The hardcoded counts (13 codes, 10 summary pages) are deliberate tripwires: adding a notice code will fail the count test until it is updated.
- Missing-translation detection works by checking that output does not contain the `shop-tasks.staff-mail` key prefix.
- The `'per-notice'` check appears in both the `it.each` filter and the test body. The second occurrence only narrows the type for TypeScript.
