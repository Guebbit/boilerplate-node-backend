# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the email-templating pipeline end-to-end: it asserts the templates directory is resolvable and populated, then renders **every** `.ejs` template in **every** supported locale through the real builder functions that supply its copy. This catches two silent failure modes that no type-check or mocked-filesystem suite can: a misconfigured `EMAIL_TEMPLATES_DIR`, and an i18next key that resolves to the key string itself (a valid string, so nothing throws).

## Key elements

- **`contentFor(locale)`** – Maps each template filename to the `EmailContent` produced by its owning builder (e.g. `'orders.order-confirm.ejs' → orderConfirmEmail(locale, …)`). Acts as the canonical list of templates that must have locale coverage.
- **`render(template, locale)`** (closure inside the describe block) – Calls `ejs.renderFile` with the template path and `contentFor(locale)[template].data`. Bypasses `nodemailer`/SMTP entirely.
- **`describe('email templates')`** – Filesystem smoke tests: directory exists, contains ≥ 1 `.ejs` file, and four specific named templates resolve to real files.
- **`describe('email templates render in every supported locale')`** – The main matrix:
  - Asserts `contentFor` keys (sorted) equal the directory listing (sorted) — prevents a new template from shipping without a locale entry.
  - `it.each` over every (template × locale) pair: asserts `<html lang="…">` is present and no unresolved i18next key (dotted identifier ≥ 3 segments) appears in the HTML.
  - Invoice document (`shared/views/templates-files/orders.invoice.ejs`) gets the same locale-rendering checks.
  - "Different copy per locale" test: renders `account.reset-confirm.ejs` in `en` and `it` and asserts the outputs differ, proving dictionaries are actually consulted.
- **Unresolved-key regex** – `/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</` — matches a dotted identifier with ≥ 2 dot-segments inside a tag body, the shape i18next leaves when a key is missing.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/mailer.ts` | Imports `emailTemplatesDirectory` (path resolver) and the `EmailContent` type used as the return shape of `contentFor`. |
| `src/infrastructure/i18n/index.ts` | Imports `listSupportedLocales` to drive the locale matrix. |
| `src/infrastructure/i18n/catalog.ts` | Indirectly exercised: the rendered HTML is checked for unresolved keys that would originate from a missing catalog entry. |
| `src/modules/account/emails.ts` | Imports 7 builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `resetConfirmEmail`, `deleteRequestEmail`, `deleteConfirmEmail`, `inactivityWarningEmail`). |
| `src/modules/delivery/emails.ts` | Imports `shipmentShippedEmail`. |
| `src/modules/feedback/emails.ts` | Imports `contactRequestEmail`. |
| `src/modules/orders/emails.ts` | Imports `orderConfirmEmail` and `invoiceDocument`. |

## Notes

- Rendering goes through **EJS directly**, not through `nodemailer`. This test is about copy correctness, not delivery/SMTP.
- The invoice template (`orders.invoice.ejs`) lives **outside** the `emailTemplatesDirectory` at `shared/views/templates-files/`; it is not covered by the directory-existence or coverage-completeness assertions, only by the locale-rendering checks.
- The four named-template resolution checks (`it.each` in the first describe) cover only `orders.order-confirm`, `account.delete-confirm`, `account.delete-request`, and `feedback.contact` — not every template. Full directory coverage is enforced later by the `contentFor` keys vs. directory listing assertion.
- All builders receive a fixed recipient name `'Ada'` and a fixed token `'a-token'`; the test is about template/i18n integrity, not content logic.
- The "different copy" test only compares `en` vs `it` for one template; it is a sanity check that dictionaries are loaded, not an exhaustive locale-diff test.
