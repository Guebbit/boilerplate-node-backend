---
source: src/modules/returns/tests/unit/emails.test.ts
sha256: 5618dae7d7ed10236bfa79d8df1ab84f8989bc6fbe9222d37e19a5874525e008
generated_at: 2026-10-29T05:50:50.476085+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/emails.test.ts

## Purpose

Unit tests for `returnNoticeEmail`, verifying that each notice kind (withdrawal-acknowledged, return-requested, return-approved, return-declined, return-closed, return-replaced, return-repaired) renders correct legal content — order reference, UTC timestamp, postage responsibility, decline reason, refund amount, remedy notice, and return address — in the customer's locale without leaking raw i18n keys.

## Key elements

- **`AT` / `INPUT`** — shared fixture: a fixed `2026-07-01T14:05:00Z` date and a base input object (`orderRef`, `returnPostage`, `at`) reused across every test.
- **`describe` "withdrawal-acknowledged"** — the legally critical notice (Art. 11a / Art. 14(1)). Asserts UTC date-time format, postage attribution ("at your own cost" vs. "We cover the cost"), omission of postage when no goods are expected back, and Italian rendering.
- **`describe` "the other notices"** — decline reason rendering (localized code sentence + free-text message), postage presence for `return-requested`/`return-approved`, and a guard that no output string starts with a `returns.*` key.
- **`describe` "closing and the return address"** — refund amount formatting per locale (`€62.50` vs. `62,50`), address line construction, and `undefined` address when none is supplied.
- **`describe` "the remedy ladder"** — `return-replaced` (no refund/postage), `return-repaired` (12-month guarantee in both `en` and `it`), and the opt-in `remedyNotice` field (present only when `remedyChoice: true`).

## Relationships

- **`src/modules/returns/emails.ts`** — the sole production import; `returnNoticeEmail` is the function under test. All assertions target the `{ data, template }` shape it returns.

## Notes

- The module doc comment cites **Art. 11a** (withdrawal acknowledgement must name order, exact date/time, and postage payer) and **Art. 14(1)** (consumer bears postage only if told beforehand) — the tests encode these as hard requirements.
- The `template` field is always asserted to be `'returns.notice'`, confirming a single shared template rather than per-kind templates.
- The "no echoed key" test (`not.toMatch(/^returns\./)`) guards against unresolved i18n tokens reaching the customer.
- `INPUT` is declared `as const`; individual tests spread and override specific fields rather than mutating it.
