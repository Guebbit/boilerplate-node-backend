---
source: src/modules/delivery/emails.ts
sha256: 30132eb9ba248fb062cf9686368ba7e83bfff52499763029ad3eaf381f541814
generated_at: 2026-09-23T18:36:09.529578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/emails.ts

## Purpose

Provides the resolved, locale-specific email content for delivery notifications. It exists to separate *what text is sent* from *how it is rendered*: the function returns a fully-translated `EmailContent` object, and whatever email template engine consumes it later performs no further resolution. This follows the same convention as `src/modules/account/emails.ts`.

## Key elements

- **`shipmentShippedEmail(locale, name, trackingCode)`** — the only export. Returns an `EmailContent` object for the `delivery.shipment-shipped` template. Accepts a locale string, the recipient's name, and an optional tracking code. Produces subject, greeting, body, footer (via shared `email.footer` key), and a conditional `tracking` line. The `tracking` data field is set to `undefined` when no code is supplied; the template's own `typeof tracking !== "undefined"` guard handles the omission.
- **i18n keys** — all strings are pulled through `translator(locale)` with keys under the `delivery.email-shipped.*` namespace, plus the shared `email.footer` key.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type that defines the shape of the returned object.
- **`src/infrastructure/i18n/index.ts`** — source of the `translator` function used to resolve every string in the email data.
- **`src/modules/delivery/service.ts`** — the caller that invokes `shipmentShippedEmail` when an order transitions to the `shipped` state.
- **`src/modules/delivery/index.ts`** — barrel re-export, making the function reachable via the module root.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — unit tests for this file's output shape and translation wiring.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the `delivery.shipment-shipped` template, including the `undefined`-tracking branch this function produces.

## Notes

- The file intentionally contains **no template rendering logic**; the `template` field is just a string key handed to the mailer adapter.
- `trackingCode` being `undefined` (not an empty string) is the contract the template relies on. Passing `""` would make the `typeof` guard pass and emit an empty tracking line.
- New delivery email types should be added here as sibling functions rather than imported from elsewhere, keeping the "language in, finished text out" rule consistent.
