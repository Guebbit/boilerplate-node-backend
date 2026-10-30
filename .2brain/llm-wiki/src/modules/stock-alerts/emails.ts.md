---
source: src/modules/stock-alerts/emails.ts
sha256: 947edf718d99beffa753186aaf8079b6cbd64a3148855c421481f957e70b8c5a
generated_at: 2026-10-29T05:57:55.994528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/emails.ts

## Purpose
Builds the single outbound email for the stock-alerts module: the "back in stock" notification. It returns a fully-populated, localized `EmailContent` object (subject, body, link) that the mailer adapter can send directly. No cross-promotion or extra content is attached.

## Key elements
- **`BackInStockEmailInput`** (interface) — the two values the caller must supply: `title` (product name, already localized) and `productUrl` (link to the product page on the paired frontend).
- **`backInStockEmail(locale, name, input)`** (function) — the only email builder in this module. Calls `translator(locale)` to produce every user-facing string (subject, greeting, body, link label, footer, meta title) and returns an `EmailContent` with template key `stock-alerts.back-in-stock`.

## Relationships
- **`@infrastructure/adapters/mailer`** — imports the `EmailContent` type; the return value of `backInStockEmail` is consumed by the mailer adapter at send time.
- **`@infrastructure/i18n`** — imports `translator` to resolve all i18n keys under `stock-alerts.email-back-in-stock.*` and the shared `email.footer`.
- **`src/modules/stock-alerts/service.ts`** — the upstream caller that constructs the `BackInStockEmailInput` and invokes `backInStockEmail` when a stock alert fires.
- **`src/modules/stock-alerts/index.ts`** — module barrel; re-exports the public surface of this file.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the rendered template output that `backInStockEmail` produces.

## Notes
- The `title` field on `BackInStockEmailInput` is expected to arrive **already localized** to the buyer's language; this file does not translate the product name itself, only the surrounding copy.
- The `locale` string is passed through into `data.locale` so the frontend template can apply per-language layout or font rules without a separate lookup.
- Follows the convention established by `@modules/account/emails`: finished strings out, locale in as a plain argument — no global locale context.
