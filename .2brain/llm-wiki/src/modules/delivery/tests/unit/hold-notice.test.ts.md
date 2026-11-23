---
source: src/modules/delivery/tests/unit/hold-notice.test.ts
source_sha256: b2c9bdcbaffc7cfa270bff80a573a177b16c43b0897c3b7ef937436fe119a2bf
context_sha256: 1f3b38ed848e589c7277012a3d322874f1596cddfabee74e46d98d01fd49dff2
generated_at: 2026-11-22T05:04:12.600189+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/hold-notice.test.ts

## Purpose
Unit tests for the buyer-facing side of order holds. They check which notice a hold reason maps to, and whether a hold triggers a mail to the buyer. A central requirement is that a risk-related hold looks like an ordinary delay, so a notice never reveals a screening result.

## Key elements
- `describe('holdNoticeOf')`: a table-driven test of the reason-to-notice mapping:
  - `awaiting_stock` maps to `awaiting_stock`.
  - `incorrect_address` maps to `check_address`.
  - `high_risk` maps to `delayed`.
  - `other` maps to `delayed`.
- Indistinguishability test: asserts that `holdNoticeOf('high_risk')` equals `holdNoticeOf('other')`, so a risk hold can't be told apart from any other reason held for a check.
- `describe('holdNeedsBuyerNotice')`: a table-driven test of `(reason, message)` against whether a mail is sent:
  - `incorrect_address` is mailed even with no message.
  - `high_risk` and `other` are mailed only when a message is present.
  - `awaiting_stock` is never mailed, with or without a message.

## Relationships
- Imports `holdNeedsBuyerNotice` and `holdNoticeOf` from `../../domain`, which is the barrel `src/modules/delivery/domain/index.ts`.
- Those functions come from `src/modules/delivery/domain/hold-notice.ts`, the implementation under test. The tests go through the barrel, so they also confirm the functions are exported from the domain index.

## Notes
- The tests use `it.each` tables with `as const`, so reasons and notices are checked as literal values.
- The `message` argument is the operator-supplied text. For `high_risk` and `other`, it alone decides whether a mail is sent.
