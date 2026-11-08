---
source: src/modules/returns/emails.ts
sha256: 572030d0739d45db943192271a7c7b6cbcdcc73e7b438d5a3dd30cd025b6441c
generated_at: 2026-11-08T07:59:15.389726+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/emails.ts

## Purpose

Resolves the copy for return and withdrawal notice emails into finished, language-specific text. It takes a notice kind, the recipient's locale, and contextual data, then returns a fully-rendered `EmailContent` object ready for the mailer adapter. The file follows the same convention as `@modules/account/emails`: the language is an explicit argument, the output is final text, and downstream rendering resolves nothing further.

## Key elements

- **`ReturnNoticeKind`** (type) — union of the nine notice variants: `withdrawal-acknowledged`, `withdrawal-recorded`, `return-requested`, `return-opened`, `return-approved`, `return-declined`, `return-closed`, `return-replaced`, `return-repaired`.
- **`ReturnNoticeInput`** (interface) — the data a notice needs: order ref, optional postage payer, timestamp, recorded-channel info, decline reason/message, refund amount, return address, and remedy-choice flag.
- **`stamp`** (private) — formats a `Date` via `Intl.DateTimeFormat` with long date, short time, and **UTC** timezone.
- **`declineSentence`** (private) — composes the decline copy: the translated reason code sentence followed by staff's free-text message (kept in staff's own language).
- **`returnNoticeEmail`** (exported function) — builds the `EmailContent` for the single `returns.notice` template, selecting subject, greeting, body, optional postage line, optional return address, optional remedy notice, and footer based on the kind and input.

## Relationships

- **`@domain-primitives/money`** — calls `formatMoney` to render refund amounts in the recipient's locale.
- **`@infrastructure/adapters/mailer`** — imports the `EmailContent` type as the return type; the produced object is handed to the mailer for sending.
- **`@infrastructure/i18n`** — imports `translator` to obtain a locale-bound translation function `t`.
- **`@modules/shop`** — imports `addressLine` to format a `ShopAddress` into a single-line string for the return-address block.
- **`@types`** — imports `ReturnPostagePayer` and `ShopAddress` as input types.
- **`src/modules/returns/index.ts`** — barrel file that re-exports this module for the rest of the codebase.
- **`src/modules/returns/services/notify.ts`** — the service layer that calls `returnNoticeEmail` when a return or withdrawal event occurs.
- **`src/modules/returns/tests/unit/emails.test.ts`** — unit tests for the copy-resolution logic.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — renders the `returns.notice` template with the data produced here.

## Notes

- **UTC timestamps.** `stamp` always formats in UTC regardless of the recipient's local timezone. This is a deliberate legal choice: an acknowledgement of a legal act must state an unambiguous moment.
- **Single template.** All nine notice kinds share the `returns.notice` template. The only differences are which copy keys are populated and whether optional blocks (postage, address, remedy notice) are present.
- **Postage suppression.** The postage line is omitted for `return-declined`, `return-closed`, `return-replaced`, and `return-repaired`, as well as when no `returnPostage` value is supplied (e.g., a pre-dispatch withdrawal where no goods come back).
- **Staff message is not translated.** In `declineSentence`, `input.declineMessage` is appended verbatim in whatever language the staff member wrote it; only the reason-code sentence goes through `t`.
- **`recorded` is narrow in scope.** It only applies to `withdrawal-recorded` (a withdrawal the shop wrote down on the buyer's behalf per Art. 11(4)); it is absent for every other kind.
