# src/modules/delivery/emails.ts

## Purpose

Resolves the user-facing copy for delivery emails into finished, fully-interpolated strings at call time. The caller passes the locale and variable values; the returned object is ready for the mailer to render without further i18n resolution. Follows the same convention as `@modules/account/emails`.

## Key elements

- **`shipmentShippedEmail(locale, name, trackingCode): EmailContent`** — The sole export. Builds a complete `EmailContent` object for the "order shipped" notification: sets the template key `delivery.shipment-shipped`, a translated subject, and a `data` bag containing greeting, body, tracking line (interpolated with `trackingCode`), page meta fields, and a shared email footer. `pageMetaLinks` is always an empty array.

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type that defines the return shape of every function in this file.
- **`@infrastructure/i18n`** (index / context) — Imports `translator`, which is called with the `locale` argument to produce a bound `t` function used for all string lookups.
- **`src/modules/delivery/service.ts`** — The delivery service is the expected caller that invokes `shipmentShippedEmail` when an order transitions to `shipped`.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — Unit tests that assert the resolved strings and structure of `shipmentShippedEmail`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates that the template key `delivery.shipment-shipped` referenced here exists in the mailer's template registry.

## Notes

- The module doc comment cross-references `@modules/account/emails` as the origin of the "pass locale in, get finished text out" rule; keep both files in sync if the convention changes.
- There is exactly one email in this file. If more delivery events (e.g. `delivered`, `failed`) are added, they belong here as additional exports following the same pattern.
- `t` is scoped per-call (created inside the function), so there is no shared translator state across invocations.
