---
source: tests/unit/infrastructure/adapters/mailer-templates.test.ts
sha256: 748ae72b83cf2a792cd0556b2654ac0eb6876064c9152d776d51b7b21d1382f3
generated_at: 2026-09-27T16:04:59.589648+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the email template pipeline end-to-end at the filesystem and rendering level: asserts that `EMAIL_TEMPLATES_DIR` points at a real directory of `.ejs` files, that every template has a matching entry in the `contentFor` map, and that each template renders in every supported locale with no unresolved i18n keys. This is the only test that can catch a wrong template path or a missing translation before a customer receives a broken email, because i18next silently returns the raw key string (a valid value) when a translation is absent.

## Key elements

- **`contentFor(locale)`** — Builds a `Record<string, EmailContent>` mapping every template filename (e.g. `orders.order-confirm.ejs`) to the `EmailContent` object produced by the corresponding module email-builder function, all parameterised with the given locale.
- **`describe('email templates')`** — Filesystem-level assertions: directory exists, contains at least one `.ejs` file, and four specific template paths resolve to real files.
- **`describe('email templates render in every supported locale')`** — The main rendering suite:
  - Cross-checks that `contentFor` keys exactly match the `.ejs` files in the directory (prevents a new template arriving without locale coverage).
  - `it.each` over every (template × locale) pair: renders via `ejs.renderFile`, asserts `<html lang="…">` is present and no dotted i18n identifier (e.g. `account.reset.subject`) appears in the HTML.
  - Invoice document test: renders `shared/templates/documents/invoicing.document.ejs` via `buildDocumentView` with the same locale assertions.
  - Locale-differentiation test: asserts `account.reset-confirm.ejs` produces different HTML in `en` vs `it`, proving dictionaries are actually consulted.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `emailTemplatesDirectory()` (the path under test) and the `EmailContent` type that shapes every rendered payload.
- **`src/infrastructure/i18n/index.ts`** — Imports `listSupportedLocales()` to drive the locale cross-product.
- **`src/modules/account/emails.ts`** — Source of 9 builder functions (verify, reset, setup, delete, inactivity, 2FA, email-change) feeding `contentFor`.
- **`src/modules/orders/emails.ts`** — Source of 6 builder functions (confirm, paid, bank-transfer ×2, card-expired, product-unavailable) feeding `contentFor`.
- **`src/modules/feedback/emails.ts`** — Source of `contactRequestEmail`.
- **`src/modules/delivery/emails.ts`** — Source of `shipmentShippedEmail`.
- **`src/modules/webhooks/index.ts`** — Source of `subscriptionDisabledEmail`.

## Notes

- **No filesystem mocking.** The tests deliberately call `existsSync` / `readdirSync` against the real filesystem so a misconfigured `EMAIL_TEMPLATES_DIR` is caught immediately, not hidden by a mock.
- **EJS, not nodemailer.** Rendering goes through `ejs.renderFile` directly; no SMTP transport or `nodemailer` mailer is involved. The scope is template correctness and copy, not delivery.
- **Unresolved-key detection is regex-based.** i18next returns the missing key string itself (e.g. `orders.confirm.heading`), which is syntactically valid HTML. The only reliable signal is a dotted identifier with two or more segments inside an HTML tag body — the test asserts none appear.
- **`contentFor` completeness is a hard invariant.** The test asserts `Object.keys(contentFor('en')).toSorted()` equals the directory listing. Adding a new `.ejs` file without adding its builder entry to `contentFor` will fail this test.
- **The invoice document is a first-class citizen here** even though it lives outside `templates/emails/`; it is held to the identical "no unresolved keys in any locale" rule.
