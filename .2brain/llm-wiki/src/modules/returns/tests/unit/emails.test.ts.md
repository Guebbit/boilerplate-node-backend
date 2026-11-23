---
source: src/modules/returns/tests/unit/emails.test.ts
source_sha256: 87a9cd19484006e7d1714f62fdf2c08888307a40c936afc95b74f2611ff54a62
context_sha256: f2efc3cc46b84493754232aaa99b0fcbf2763a69d1fd3aa2540247f480fbe8dc
generated_at: 2026-11-22T07:39:02.479897+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/emails.test.ts

## Purpose
Unit tests for `returnNoticeEmail`, which renders the return and withdrawal notice emails. The main focus is the withdrawal acknowledgement (Art. 11a). It must name the order, the exact date and time, and who pays return postage (Art. 14(1)). The remaining notice kinds are covered too.

## Key elements
- `AT` / `INPUT`: shared fixtures. The instant is `2026-07-01T14:05:00Z`, the order ref is `2026-000041`, and `returnPostage` is `'consumer'`.
- **withdrawal-acknowledged** suite checks:
  - the template is `returns.notice`;
  - the order ref, "July 1, 2026", a 2:05 PM time and "UTC" appear;
  - postage reads "at your own cost" by default;
  - postage reads "We cover the cost" when `returnPostage` is `'shop'`;
  - `data.postage` is undefined when no postage is given, while the body still names the order;
  - the Italian locale body contains "recesso" and `data.locale` is `'it'`.
- **other notices** suite checks:
  - `return-declined` includes the decline message and no postage;
  - decline-reason codes are translated per locale (`no_defect_found`, `return_period_ended`), followed by the free-text message;
  - `return-requested` and `return-approved` each have a postage string;
  - all four main kinds resolve their copy slots (`subject`, `greeting`, `footer`, `body`, `postage`) instead of echoing `returns.*` keys, and the greeting contains the recipient name.
- **closing and return address** suite checks:
  - `return-closed` shows the refund as `€62.50` in English and `62,50` in Italian, with no postage;
  - `return-approved` sets `data.address` to "Send the goods to: Returns, Via Roma 1, 20100 Milano, IT" when a `returnAddress` is given, and leaves it undefined otherwise.
- **remedy ladder** suite checks:
  - `return-replaced` mentions a replacement and has no postage;
  - `return-repaired` mentions "12 months" in English and "12 mesi" in Italian;
  - `data.remedyNotice` is set only when `remedyChoice: true`, and is undefined otherwise.

## Relationships
Imports `returnNoticeEmail` from `src/modules/returns/emails.ts`, which is the only module under test. The tests read its result as `{ subject, template, data }`, where `data` has `body`, `postage`, `greeting`, `footer`, `locale`, `address` and `remedyNotice`.

## Notes
- The withdrawal suite calls `returnNoticeEmail` at describe time, not inside `it`. The shared result is therefore computed during test collection.
- The time assertion allows an optional space before PM (`/2:05\s?PM/`), which tolerates differing locale-formatting whitespace.
- Omitting `returnPostage` is how "no goods expected back" is expressed.
