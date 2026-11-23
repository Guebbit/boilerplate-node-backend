---
source: src/modules/stock-alerts/emails.ts
source_sha256: 947edf718d99beffa753186aaf8079b6cbd64a3148855c421481f957e70b8c5a
context_sha256: 2770bc9745f7aadd08c3e09cd8767f9b46ad18764bb798d7d2c26be0e244f19f
generated_at: 2026-11-22T07:54:04.265481+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/emails.ts

## Purpose
Builds the single email the stock-alerts module sends: "back in stock". It produces finished, localized strings (language passed as an argument, mirroring `@modules/account/emails`) for one product and a link to it, with no other promotional content.

## Key elements
- `BackInStockEmailInput` — interface with `title` (product name in the recipient's language) and `productUrl` (product page on the paired frontend).
- `backInStockEmail(locale, name, input)` — returns an `EmailContent` with:
  - `template: 'stock-alerts.back-in-stock'`
  - `subject` built from the product title
  - `data`: `locale`, `pageMetaTitle`, `greeting` (uses `name`), `body` (uses `title`), `once`, `linkLabel`, `linkUrl` (the `productUrl`), and `footer`.

## Relationships
- `src/infrastructure/adapters/mailer.ts` — supplies the `EmailContent` type that this file's return value conforms to.
- `src/infrastructure/i18n/index.ts` — supplies `translator(locale)`, used to resolve all text keys.

## Notes
- All strings come from i18n keys under `stock-alerts.email-back-in-stock.*`, except the footer, which uses the shared `email.footer` key.
- The function is pure formatting: no sending, no lookups. The caller must provide the already-localized product title and URL.
- The template name `stock-alerts.back-in-stock` must match a template known to the mailer.
