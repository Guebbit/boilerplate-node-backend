---
source: src/modules/returns/emails.ts
sha256: ab701aa1612edfca5699e17e8c17ff7caa0a43c195a139acba84a561853c66f0
generated_at: 2026-10-15T11:53:23.056048+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/emails.ts

## Purpose

Resolves the customer-facing copy for all return/withdrawal notices into finished, language-ready strings at call time. It exists so that whichever layer sends the email (mail adapter, queue worker, etc.) only ever handles complete text and never performs locale lookups itself — the same "resolve here, render nowhere" rule as `@modules/account/emails`.

## Key elements

- **`ReturnNoticeKind`** (type) — union of the five notice variants: `withdrawal-acknowledged`, `return-requested`, `return-approved`, `return-declined`, `return-closed`.
- **`ReturnNoticeInput`** (interface) — the data a caller must supply to fill the template: `orderRef`, optional `returnPostage` payer, `at` (Date), optional `declineReason`, optional `refund` amount, optional `returnAddress`.
- **`returnNoticeEmail`** (exported function) — takes `kind`, `locale`, `name`, and `input`; returns a fully populated `EmailContent` object (template id `returns.notice`, subject, and a `data` bag with greeting, body, optional postage line, optional return-address line, and footer).
- **`stamp`** (private helper) — formats a `Date` as long date + short time in **UTC** via `Intl.DateTimeFormat`, satisfying Art. 11a's requirement that an acknowledgement state the exact moment.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type that shapes the return value of `returnNoticeEmail`.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — imports `translator`, which is called once per email to obtain a locale-bound translation function `t`.
- **`src/modules/orders/index.ts`** — imports `addressLine` to format the `ReturnAddress` for the approval notice.
- **`src/modules/orders/emails.ts`** — cited in the module doc-block as the precedent for the resolve-at-call-time convention; no runtime import.
- **`src/modules/returns/services/notify.ts`** — the service layer that calls `returnNoticeEmail` and hands the result to the mailer.
- **`src/modules/returns/index.ts`** — module barrel; re-exports this file's public symbols.
- **`src/modules/returns/tests/unit/emails.test.ts`** — unit tests exercising `returnNoticeEmail` across kinds and locales.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — verifies the `returns.notice` template renders the `data` bag this file produces.

## Notes

- **Single template, many kinds.** All five notices share one `returns.notice` template; the only variation is which copy strings and which optional slots (postage, address) are populated. There is no per-kind template.
- **Postage line is deliberately suppressed** for `return-declined` and `return-closed` (nothing is being posted) and when `returnPostage` is absent (withdrawal before dispatch).
- **Date/time is always UTC.** The `stamp` helper hard-codes `timeZone: 'UTC'` to avoid ambiguity across a customer's local timezone — do not "fix" this to local time.
- **`locale` is a string argument, not a context read.** The function is pure with respect to the locale: pass it in, get finished text out. This keeps the mailer layer free of i18n dependencies.
- **`refund.amount` is formatted via `Intl.NumberFormat`** with the caller-supplied currency code; there is no hardcoded currency.
