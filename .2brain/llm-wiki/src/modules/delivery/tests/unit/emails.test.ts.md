---
source: src/modules/delivery/tests/unit/emails.test.ts
sha256: 3e41350db17658809c40766d20313a92702ee6503a0c097a2274b8e253bab2b3
generated_at: 2026-09-23T18:38:14.011030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit test for the `shipmentShippedEmail` builder. It verifies that the dispatch email renders correctly: the tracking code is interpolated (never left as a raw `{{…}}` token), the customer's name appears in the greeting, every copy slot is resolved to real text rather than an i18n key, and locale selection drives actual translation differences.

## Key elements

- **`NAME` / `CODE`** – Shared fixture constants (`'Ada Lovelace'`, `'TRK-99887766'`) used by every test case.
- **`describe('shipmentShippedEmail', …)`** – Contains five assertions:
    - _names the dispatch template_ – `.template` equals `'delivery.shipment-shipped'`.
    - _puts the tracking code in the message_ – `data.tracking` contains `CODE` and has **no** `{{` remnants.
    - _greets the customer by name_ – `data.greeting` contains `NAME`.
    - _resolves every copy slot rather than echoing a key_ – `subject`, `data.pageMetaTitle`, `data.body`, `data.footer` are non-empty and do not start with `'delivery.'`; `data.pageMetaLinks` is `[]`.
    - _carries the locale through and translates by it_ – `locale` is passed through (`'en'` / `'it'`), and the Italian `subject` differs from the English one.

## Relationships

- **`src/modules/delivery/emails.ts`** – Sole import. The test exercises `shipmentShippedEmail(locale, name, trackingCode)` and asserts on the shape of the object it returns (`template`, `subject`, `data.{tracking, greeting, pageMetaTitle, body, footer, pageMetaLinks, locale}`).

## Notes

- The tracking-code test is the file's stated primary concern (see the module doc-comment): an empty or half-interpolated code is the failure mode that makes the email useless to the customer.
- The "resolves every copy slot" test is a guard against i18n fallback regressions where a missing key would surface as the key string itself (e.g. `"delivery.shipment-shipped.body"`).
- `data.tracking` is cast with `as string`; the test relies on the builder always producing a string there, not an object.
