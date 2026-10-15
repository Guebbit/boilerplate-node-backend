---
source: src/modules/returns/tests/unit/emails.test.ts
sha256: 5a7abfdbe42edb79b61955a265f38dd0b337f3506d08da0a13663be933c93ab5
generated_at: 2026-10-15T12:01:35.745799+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/emails.test.ts

## Purpose

Unit tests for the `returnNoticeEmail` function, verifying that every return/withdrawal notice renders correct copy, legal required fields (order ref, exact UTC date-time, postage responsibility per Art. 11a / Art. 14(1)), locale-appropriate formatting, and that no i18n key strings leak into the output.

## Key elements

- **`INPUT`** — a shared, frozen test fixture (`orderRef`, `returnPostage`, `at` date) reused across most cases.
- **`describe('returnNoticeEmail — withdrawal-acknowledged')`** — asserts template ID, order ref, UTC date/time format, postage wording (consumer vs. shop), that postage is omitted when no goods return is expected, and Italian locale rendering.
- **`describe('returnNoticeEmail — the other notices')`** — covers `return-declined` (reason present, no postage), `return-requested` / `return-approved` (postage string present), and a parameterised "copy slot" check confirming none of `subject`, `greeting`, `footer`, `body`, `postage` starts with `returns.` (i.e. no raw i18n key escapes).
- **`describe('returnNoticeEmail — closing and the return address')`** — validates refund amount formatting (locale-aware: `€62.50` in en, `62,50` in it), the assembled `address` string when a return address is supplied, and its absence when none is given.

## Relationships

- **`src/modules/returns/emails.ts`** — sole import. Provides `returnNoticeEmail`, the function under test. No other module is referenced.

## Notes

- The `as const` on `INPUT` and the `returnPostage: _unused` destructuring pattern are used to exercise the *optional* postage field (i.e. the no-goods-return path) without mutating the shared fixture.
- The "copy slot" test is a guard against a regression where an i18n lookup silently returns the key itself (e.g. `returns.notice.body`) instead of resolved text.
- Date assertions expect a specific rendering (`July 1, 2026` / `2:05 PM` / `UTC`), so the test is locale-sensitive to the `en` output even though it tests the `en` branch.
- The module-level doc comment in the source file references Art. 11a and Art. 14(1) of the EU consumer directives; the tests encode those legal requirements as explicit string expectations.
