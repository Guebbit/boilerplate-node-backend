---
source: src/modules/returns/tests/unit/emails.test.ts
sha256: c3bc6aa6b3facf6ea4944ff7466782ca37a565a4372bdac7cb508b0d0a48a8fd
generated_at: 2026-11-08T08:12:50.218326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/emails.test.ts

## Purpose

Unit-test suite for the `returnNoticeEmail` function. It verifies that every statutory and informational return notice (withdrawal-acknowledged, return-requested, return-approved, return-declined, return-closed, return-replaced, return-repaired) renders the correct legal content — order reference, exact UTC timestamp, postage responsibility, refund amount, remedy language, and localisation — through a single shared template.

## Key elements

- **`AT` / `INPUT`** – Shared fixtures: a fixed UTC date (`2026-07-01T14:05:00Z`) and a default input object with `orderRef`, `returnPostage: 'consumer'`, and `at`.
- **`describe('returnNoticeEmail — withdrawal-acknowledged')`** – Asserts the template key (`returns.notice`), presence of order ref + UTC date/time, consumer-vs-shop postage wording, omission of postage when no goods return, and Italian localisation.
- **`describe('returnNoticeEmail — the other notices')`** – Covers `return-declined` (reason code sentence + free-text message), `return-requested`/`return-approved` (postage string present), and a cross-cutting check that **no** rendered copy slot contains a raw `returns.*` key.
- **`describe('returnNoticeEmail — closing and the return address')`** – Validates refund-amount rendering (locale-aware: `€62.50` vs `62,50`), the `data.address` field when a `returnAddress` is supplied, and its absence when not.
- **`describe('returnNoticeEmail — the remedy ladder')`** – Verifies replacement/repair wording, the 12-month guarantee-extension sentence in both locales, and that `remedyNotice` is emitted **only** when `remedyChoice` is explicitly true.

## Relationships

- **`src/modules/returns/emails.ts`** – Sole import. The test exercises `returnNoticeEmail(kind, locale, name, input)` and inspects its `{ data, template, subject }` return value. No other modules are touched.

## Notes

- The "no postage" case is tested by destructuring `returnPostage` out of `INPUT` (`const { returnPostage: _unused, ...withoutPostage }`); the function is expected to simply omit the `data.postage` key rather than render an empty string.
- The copy-slot integrity test filters `data` fields to strings and asserts none match `/^returns\./`, guarding against untranslated i18n keys leaking into customer-facing copy.
- `returnPostage` is typed as the literal `'consumer' | 'shop' | undefined` (inferred from the `as const` fixture); the test relies on the function's contract to treat its absence as "do not mention postage."
- Remedy notice (`data.remedyNotice`) is opt-in via a `remedyChoice: true` flag — it is **not** part of the default approved/replaced/repaid output.
