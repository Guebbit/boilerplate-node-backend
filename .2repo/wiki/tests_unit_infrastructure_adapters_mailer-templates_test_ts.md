# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the email-template pipeline end-to-end at the copy level: verifies the template directory resolves to real files, then renders every `.ejs` template in every supported locale through the same builders that fill them in production. Catches two silent failure modes that no type-check or mock-based test can see — a wrong `EMAIL_TEMPLATES_DIR` and missing i18n keys that i18next would silently return as the key string itself.

## Key elements

- **`contentFor(locale)`** — Local helper that maps every known `.ejs` filename to the `EmailContent` object produced by the corresponding module builder for the given locale. Acts as the single source of truth for which builder owns which template.
- **`describe('email templates')`** — Path/directory sanity checks: `emailTemplatesDirectory()` exists, contains at least one `.ejs` file, and a list of specific filenames resolves to real files.
- **`describe('email templates render in every supported locale')`** — Core suite. Flattens `listSupportedLocales() × templates` into per-case render tests. Each case renders via `ejs.renderFile` and asserts (a) the `<html lang="…">` attribute matches, and (b) no unresolved dotted i18next key survives in the HTML.
- **Unresolved-key regex** — `/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</` detects i18next's fallback behaviour (returning the key like `account.reset.heading` as literal text).
- **Invoice document test** — Renders `shared/views/templates-files/orders.invoice.ejs` (outside the main templates dir) with the same locale-coverage assertions.
- **Locale-difference test** — Asserts `en` and `it` produce different HTML for the same template, proving dictionaries are actually consulted.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type and the `emailTemplatesDirectory()` function under test.
- **`src/infrastructure/i18n/index.ts`** — Imports `listSupportedLocales()` to enumerate the locale × template matrix.
- **`src/modules/account/emails.ts`** — Imports all six account email builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `resetConfirmEmail`, `deleteRequestEmail`, `deleteConfirmEmail`); their output is fed to the renderer.
- **`src/modules/orders/emails.ts`** — Imports `orderConfirmEmail` and `invoiceDocument`.
- **`src/modules/delivery/emails.ts`** — Imports `shipmentShippedEmail`.
- **`src/modules/feedback/emails.ts`** — Imports `contactRequestEmail`.

## Notes

- Rendering uses `ejs.renderFile` directly — no `nodemailer` or SMTP transport is involved. This test is about the copy, not delivery.
- The `contentFor` map must be kept in sync with the on-disk template directory; a dedicated test asserts `Object.keys(contentFor('en')).toSorted()` equals the directory listing. Adding a new `.ejs` file without a corresponding builder entry will fail this test.
- The invoice document lives at a **different path** (`shared/views/templates-files/`) and is tested separately but held to the same translation rules.
- The "different copy per locale" test only compares `en` vs `it` for one template (`account.reset-confirm.ejs`). It is a smoke check that dictionaries are loaded, not a full equivalence proof across all templates.
