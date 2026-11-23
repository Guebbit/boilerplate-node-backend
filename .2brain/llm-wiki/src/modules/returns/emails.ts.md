---
source: src/modules/returns/emails.ts
source_sha256: 7136576f6717c2ddb19d8e06c1ba37aadeaf51015a3e7be0b83f30aceae14c9d
context_sha256: 97173ceb4cbca380e54ce682fd297ada6d2be527c73281834a855d2e7f089233
generated_at: 2026-11-22T07:24:57.885706+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/emails.ts

## Purpose
Builds the customer-facing emails for the returns module as finished, already-translated strings. The language is passed in as an argument and the output is final text, so the mailer that renders it later resolves nothing. A single template, `returns.notice`, carries every notice (greeting, body, optional postage line). What differs between notices is copy, which lives in the locale files.

## Key elements
- `ReturnNoticeKind`: union of the nine notice kinds: `withdrawal-acknowledged`, `withdrawal-recorded`, `return-requested`, `return-opened`, `return-approved`, `return-declined`, `return-closed`, `return-replaced`, `return-repaired`. Each names a copy block in the locale files.
- `ReturnNoticeInput`: data that fills the copy.
  - `orderRef`, `at`: always present.
  - `returnPostage`: who pays the postage; absent when no goods are expected back.
  - `recorded`: `{ via, at }` for a withdrawal the shop recorded.
  - `declineReason`, `declineMessage`: the decline code and the optional staff message.
  - `refund`: `{ amount, currency }` for a closed return.
  - `returnAddress`: the `ShopAddress` to send goods to, on an approval.
  - `remedyChoice`: flag that adds the remedy notice (2024/1799).
- `returnNoticeEmail(kind, locale, name, input): EmailContent`: the only exported function. It builds a translator for the locale and returns `{ template: 'returns.notice', subject, data }`. `data` holds `locale`, `pageMetaTitle`, `greeting`, `body`, `postage`, `address`, `remedyNotice` and `footer`.
- `stamp` (private): formats a date as long date plus short time in **UTC** via `Intl.DateTimeFormat`. Legal acknowledgements (Art. 11a) must give an exact moment.
- `declineSentence` (private): returns the translated decline-reason sentence, followed by the staff message if there is one. It returns `''` when there is no `declineReason`.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: provides the `EmailContent` return type.
- `src/infrastructure/i18n/index.ts`: provides `translator(locale)`, which resolves all the copy keys this file uses.
- `src/domain-primitives/money.ts`: `formatMoney` renders the refund amount for the locale.
- `src/modules/shop/index.ts`: `addressLine` formats the return address.
- `src/types/index.ts`: provides `ReturnPostagePayer` and `ShopAddress`.
- Tests: `src/modules/returns/tests/unit/emails.test.ts` covers this file. `tests/unit/infrastructure/adapters/mailer-templates.test.ts` is a related mailer template test.
- `src/modules/returns/services/notify.ts` and `src/modules/returns/index.ts` sit in the graph neighborhood, but this file does not import them.

## Notes
- The postage line is omitted for `return-declined`, `return-closed`, `return-replaced` and `return-repaired` even if `returnPostage` is set. It is also omitted whenever `returnPostage` is absent.
- Translation keys are built dynamically from `kind`, `declineReason`, `recorded.via` and `returnPostage`: `returns.email.${kind}.subject`, `...${kind}.body`, `decline-reason.*`, `via-*` and `postage-*`. A new kind or reason therefore needs matching locale entries.
- `declineMessage` is staff's own text and is not translated. Only the reason code's sentence follows the buyer's language.
- Parameters not applicable to a kind (`recorded`, `via`, `reason`, `amount`) default to empty strings.
- The subject is used both as the email subject and as `pageMetaTitle`.
