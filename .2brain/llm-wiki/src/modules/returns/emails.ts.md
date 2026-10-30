---
source: src/modules/returns/emails.ts
sha256: 5a4386f09a057564f4c555e1189f15e4e08a540c3bb4b4360ec92ddc6ba1bdfc
generated_at: 2026-10-29T05:38:51.378902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/emails.ts

## Purpose

Composes the finished, localized email content for every return and withdrawal notice the returns module sends. It resolves all copy into concrete strings at call time (via the i18n translator), so the downstream renderer (`mailer` adapter) only formats an `EmailContent` object and resolves nothing further. A single template ID (`returns.notice`) carries all notice kinds; differences live in the locale files, not in separate templates.

## Key elements

- **`ReturnNoticeKind`** (type) — Discriminant union of the nine notice variants (`withdrawal-acknowledged`, `withdrawal-recorded`, `return-requested`, `return-opened`, `return-approved`, `return-declined`, `return-closed`, `return-replaced`, `return-repaired`).
- **`ReturnNoticeInput`** (interface) — All data a notice may need: `orderRef`, `at`, optional `returnPostage`, `recorded`, `declineReason`/`declineMessage`, `refund`, `returnAddress`, `remedyChoice`.
- **`returnNoticeEmail`** (exported function) — Main entry point. Takes `kind`, `locale`, `name`, and `input`; returns a ready-to-send `EmailContent` with subject, greeting, body, postage line, return address, remedy notice, and footer.
- **`stamp`** (internal) — Formats a `Date` as long date + short time in UTC using `Intl.DateTimeFormat`, required by Art. 11a for unambiguous timestamps.
- **`declineSentence`** (internal) — Builds the decline reason string: translated code sentence + optional staff-written message (which stays in staff's language).

## Relationships

- **`@infrastructure/adapters/mailer`** — Consumes the `EmailContent` type as the return shape of `returnNoticeEmail`.
- **`@infrastructure/i18n`** — Calls `translator(locale)` to obtain a translation function; all copy keys are resolved here.
- **`@domain-primitives/money`** — Uses `formatMoney` to render the refund amount in the buyer's locale.
- **`@modules/shop`** — Calls `addressLine` to flatten a `ShopAddress` into a single-line string for the return-address field.
- **`@types`** — Imports `ReturnPostagePayer` and `ShopAddress` for the input interface.
- **`src/modules/returns/services/notify.ts`** — The service layer that assembles `ReturnNoticeInput` and calls `returnNoticeEmail`.
- **`src/modules/returns/index.ts`** — Re-exports the public surface of this module.
- **`src/modules/returns/tests/unit/emails.test.ts`** — Unit tests exercising each notice kind and edge cases.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates the `returns.notice` template renders the data shape this file produces.

## Notes

- **No unresolved placeholders.** By design, `returnNoticeEmail` returns fully-rendered strings; the mailer adapter must not attempt further interpolation.
- **UTC timestamps are deliberate.** `stamp` forces `timeZone: 'UTC'` to satisfy the legal requirement for an unambiguous acknowledgement time (Art. 11a). Do not "fix" this to local time.
- **Postage suppression is kind-based, not input-based.** Even if `returnPostage` is set, the postage line is omitted for `return-declined`, `return-closed`, `return-replaced`, and `return-repaired`.
- **`declineMessage` is intentionally un-translated.** It is staff's free-text note and passes through verbatim; only the `declineReason` code is looked up in the locale.
- **`remedyChoice` is boolean-only.** When true, a static `returns.email.remedy-notice` string is appended; no dynamic content is injected for this field.
