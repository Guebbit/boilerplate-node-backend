---
source: tests/unit/infrastructure/adapters/mailer-templates.test.ts
sha256: d3c7ed6fc17439bcfd0be78dc2e075747a96c8e20079b409f87c21d34ce974db
generated_at: 2026-09-23T20:19:07.138099+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the email-template pipeline end-to-end: verifies that the EJS template directory and its files actually exist on disk, and that every template renders for every supported locale without leaking unresolved i18next keys. It exists because a wrong `EMAIL_TEMPLATES_DIR` or a missing translation key is invisible to the type system and to tests that mock the filesystem away.

## Key elements

- **`contentFor(locale)`** — Returns a map of template filename → `EmailContent` by calling the corresponding builder from each module's `emails.ts` with a fixed test user (`Ada`) and locale. One entry per `.ejs` file in the directory.
- **`describe('email templates')`** — Asserts `emailTemplatesDirectory()` resolves to an existing path, contains ≥ 1 `.ejs` file, and that four known templates exist as real files.
- **`describe('email templates render in every supported locale')`** — Cross-products every template × every locale from `listSupportedLocales()`, renders via `ejs.renderFile`, and asserts:
    - Output contains `<html lang="<locale>"`.
    - No dotted i18next key identifier (regex: `\b[a-z]+(?:\.[\da-z-]+){2,}\b`) appears in the HTML — the shape a missing key leaves behind.
- **Invoice document test** — Same render-and-check rules applied to `shared/templates/documents/orders.invoice.ejs`, which lives outside the main templates directory.
- **Locale-differentiation test** — Renders `account.reset-confirm.ejs` in `en` and `it`, asserts the outputs differ, proving dictionaries are actually consulted.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Source of the `EmailContent` type and the `emailTemplatesDirectory()` path helper under test.
- **`src/infrastructure/i18n/index.ts`** — Provides `listSupportedLocales()`; defines the set of locales each template is rendered against.
- **`src/infrastructure/i18n/catalog.ts`** — The translation dictionaries that `contentFor` builders load; the test's "no unresolved keys" assertion is only meaningful because of this catalog.
- **`src/modules/account/emails.ts`** — All 9 account email builders (verify, reset, setup, delete, inactivity, 2FA, email-change).
- **`src/modules/orders/emails.ts`** — `orderConfirmEmail`, `invoiceDocument`, `bankTransferInstructionsEmail`, `bankTransferExpiredEmail`, `productUnavailableCancelledEmail`.
- **`src/modules/delivery/emails.ts`** — `shipmentShippedEmail`.
- **`src/modules/feedback/emails.ts`** — `contactRequestEmail`.
- **`src/modules/webhooks/index.ts`** — Barrel re-export from which `subscriptionDisabledEmail` is imported.

## Notes

- Deliberately uses real `fs` calls (`existsSync`, `readdirSync`), not mocks — the file's own docstring explains that mocking the filesystem would hide a bad `EMAIL_TEMPLATES_DIR`.
- The `contentFor` map must stay in sync with the directory contents: the test `has copy registered for every template in the directory` asserts the keys equal the `.ejs` files. Adding a new template without a builder entry will fail here.
- The "no unresolved keys" regex targets dotted identifiers with **two or more** dot-segments (e.g. `account.reset.confirm`), matching i18next's fallback shape. Single-word class names or CSS selectors won't trigger it.
- Rendering goes through `ejs.renderFile` directly, not `nodemailer` — the test validates copy correctness, not SMTP delivery.
- The invoice template is in `shared/templates/documents/`, not `templates/emails/`, so it is not covered by the directory-scan loop and is tested separately.
