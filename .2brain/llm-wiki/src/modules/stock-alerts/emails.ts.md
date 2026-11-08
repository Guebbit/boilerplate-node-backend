---
source: src/modules/stock-alerts/emails.ts
sha256: 947edf718d99beffa753186aaf8079b6cbd64a3148855c421481f957e70b8c5a
generated_at: 2026-11-08T08:27:56.109944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/emails.ts

## Purpose

Builds the single email the stock-alerts module sends — a "back in stock" notification. It turns a product name, a product URL, a buyer's name, and a locale into a finished, localized `EmailContent` object ready for the mailer to render. By design it is the only email in this module and carries no cross-promotion.

## Key elements

- **`BackInStockEmailInput`** (interface) — the two values the caller must supply: `title` (product name in the recipient's language) and `productUrl` (link to the product page on the paired frontend).
- **`backInStockEmail(locale, name, input)`** (exported function) — calls `translator(locale)` to resolve every string, then returns an `EmailContent` with:
  - `template: 'stock-alerts.back-in-stock'` (the mailer template to render)
  - `subject` — localized with the product title interpolated
  - `data` — an object containing `locale`, `pageMetaTitle`, `greeting`, `body`, `once`, `linkLabel`, `linkUrl`, and `footer`

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type that `backInStockEmail` returns.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — imports the `translator` factory used to produce the locale-specific `t()` function.
- **`src/modules/stock-alerts/service.ts`** — the caller that invokes `backInStockEmail` when an alert fires (via the module index).
- **`src/modules/stock-alerts/index.ts`** — re-exports this file's public surface to the rest of the application.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the rendered template that this function targets.

## Notes

- The module doc-comment is a **design constraint**, not just documentation: there is exactly one email, no additional promotional content may be added. Treat this as intentional scope, not an oversight.
- `locale` appears in two roles: it drives translation *and* is forwarded into `data.locale` so the mailer template can use it at render time.
- The footer key is the shared `'email.footer'`, not a stock-alerts-specific key — it will always match whatever the global footer string is at render time.
- The `once` data field is a short reassurance line (e.g., "no further alerts will be sent"); its exact wording lives entirely in i18n.
