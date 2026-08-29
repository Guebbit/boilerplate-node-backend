# src/modules/delivery/emails.ts

## Purpose

Resolves delivery email copy into finished, render-ready strings. Each exported function takes a locale and domain-specific variables, runs them through the i18n translator, and returns a fully-populated `EmailContent` object so that whatever renders the email later performs zero further string resolution.

## Key elements

- **`shipmentShippedEmail(locale, name, trackingCode): EmailContent`** — The only export. Builds the "your order is on its way" email (template `delivery.shipment-shipped`). Translates subject, greeting, body, tracking line, and footer via the `delivery.email-shipped.*` i18n namespace and returns them inside the standard `EmailContent` shape (template, subject, data).

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Provides the `translator` factory used to obtain a locale-scoped translation function.
- **`src/infrastructure/adapters/mailer.ts`** — Supplies the `EmailContent` type that defines the return shape (template / subject / data contract) the mailer adapter expects.
- **`src/modules/delivery/service.ts`** — The delivery service that calls `shipmentShippedEmail` when an order transitions to `shipped`, then passes the result to the mailer.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Exercises email templates end-to-end; this file's output shape is one of the templates under test.

## Notes

- The header comment explicitly cross-references `@modules/account/emails` for the shared convention: *language is an argument, output is finished text, the renderer resolves nothing*. If you add a new delivery email, follow the same pattern in this file rather than inlining translation calls at the render site.
- `data.pageMetaLinks` is always an empty array in the current template; include it for forward-compatibility with the mailer's HTML shell.
- Only one email variant exists in this file so far. The file is intentionally separate from `service.ts` so that copy and orchestration stay decoupled.
