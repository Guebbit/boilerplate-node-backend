# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the EJS email-template pipeline end-to-end: asserts the template directory is real, that every `.ejs` file resolves, and that each template renders in every supported locale with no leaked i18n keys. It exists because a wrong `EMAIL_TEMPLATES_DIR` or a missing translation key is invisible to TypeScript and to tests that mock the filesystem — only actual file I/O plus rendering surfaces the failure.

## Key elements

- **`contentFor(locale)`** — maps every `.ejs` filename to the `EmailContent` produced by the owning module's email builder (account, orders, delivery, feedback). Drives all render assertions.
- **`describe('email templates')`** — filesystem sanity: directory exists, ≥ 1 `.ejs` file present, and five named templates resolve to real paths.
- **`describe('email templates render in every supported locale')`** — the cross-product of `listSupportedLocales()` × every `.ejs` in the directory. For each pair: renders via `ejs.renderFile`, asserts `<html lang="…">` is set, and asserts no dotted i18n identifier (≥ 2 segments) survives in the HTML.
- **Invoice document test** — renders `shared/views/templates-files/orders.invoice.ejs` (outside the email dir) with the same locale and no-unresolved-key assertions.
- **Locale-divergence test** — renders `account.registration-confirm.ejs` in `en` and `it`, asserts the outputs differ, proving the dictionaries are actually consulted.
- **Coverage guard** — `Object.keys(contentFor('en')).toSorted()` must equal the directory listing `.toSorted()`, so a new `.ejs` file without a builder entry fails immediately.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/mailer.ts` | Imports `emailTemplatesDirectory()` (the path under test) and the `EmailContent` type. |
| `src/infrastructure/i18n/index.ts` | Imports `listSupportedLocales()` to build the locale × template cross-product. |
| `src/infrastructure/i18n/catalog.ts` | Exercised indirectly — the "different copy per locale" and no-unresolved-key assertions verify that translations resolve through the catalog. |
| `src/modules/account/emails.ts` | Imports six builders: `registrationConfirmEmail`, `verifyRequestEmail`, `resetRequestEmail`, `resetConfirmEmail`, `deleteRequestEmail`, `deleteConfirmEmail`. |
| `src/modules/orders/emails.ts` | Imports `orderConfirmEmail` and `invoiceDocument`. |
| `src/modules/delivery/emails.ts` | Imports `shipmentShippedEmail`. |
| `src/modules/feedback/emails.ts` | Imports `contactRequestEmail`. |

## Notes

- Rendering goes through **EJS directly**, not `nodemailer` — no SMTP transport is started. The test is about copy correctness, not delivery.
- The "unresolved key" check is the regex `/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</` — it targets the dotted-identifier shape i18next emits when a key is missing (the key string itself becomes the "translation").
- The invoice template lives in a **different directory** (`shared/views/templates-files/`) from the email templates; it is tested separately but held to the same translation rule.
- The coverage guard (`contentFor` keys === directory listing) is the single mechanism preventing a new template from shipping with zero locale coverage.
- Uses `Array.prototype.toSorted()` (ES 2023) for order-independent comparison.
