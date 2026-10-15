---
source: src/modules/account/tests/unit/emails.test.ts
sha256: d69a513c1c79aef44451e0171369917eb39a70749c002409a9e04a1acd30e102
generated_at: 2026-10-15T10:14:37.861003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the nine account email-builder functions in `emails.ts`. They verify that each builder returns the correct template name, delegates to the right link helper with the correct `kind`/locale/token, resolves every i18n slot to real copy (not a raw key or empty string), interpolates the recipient's name, and that no two emails accidentally share a template or a link destination.

## Key elements

- **`LINK_EMAILS`** – const array of `[name, builder, template, kind]` tuples for the four link-carrying emails (verify, reset, setup, delete request). Drives `it.each` loops for template, link, and copy assertions.
- **`CONFIRM_EMAILS`** – const array of `[name, builder, template]` tuples for the three no-link confirmation emails (reset-confirm, delete-confirm, export-failed).
- **`copySlots(content)`** – helper that flattens `content.subject` and `content.data` into `[key, value]` pairs, excluding `locale` and `linkUrl`. Used to assert every remaining slot is a non-empty string that doesn't match `/^account\.email\./`.
- **`greetableName`** – imported from `emails.ts`; the test file imports it but the visible tests exercise name interpolation via each builder's `data.greeting` directly.
- **Describes:** "the template each one names," "the action links," "the copy," "the data export link," "the two-factor lock notice," "the two-factor change notice," "the name in a greeting."

## Relationships

- **`src/modules/account/emails.ts`** – The system under test. All nine builder functions (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `deleteRequestEmail`, `resetConfirmEmail`, `deleteConfirmEmail`, `exportReadyEmail`, `exportFailedEmail`, `twoFactorChangedEmail`, `twoFactorLockedEmail`) plus `greetableName` are imported and called with `'en'`/`'it'`, a name, a token, and (where applicable) an export ID or minutes count.
- **`src/modules/account/config.ts`** – Provides `accountFrontendLink` and `accountExportLink`, the expected link-URL helpers. Tests assert that each builder's `data.linkUrl` equals the corresponding config-helper call with the same `kind`, `locale`, and `token`/`exportId`, confirming the builder delegates rather than hard-coding URLs.

## Notes

- `setupRequestEmail` intentionally shares the `'reset'` kind with `resetRequestEmail`; the "each token to its own kind" test excludes it and tests only verify/reset/delete.
- The "distinct template" test guards against a copy-paste bug where two builders point at the same i18n template while each individual assertion still passes.
- The shared-footer test (`new Set(footers).size === 1`) enforces that all nine emails use one `email.footer` key, preventing drift when the company address changes.
- Copy assertions reject values matching `/^account\.email\./` — the signature of i18next returning the key itself when a translation is missing — and reject `{{` to catch uninterpolated variables.
- `exportReadyEmail` and `twoFactorChangedEmail`/`twoFactorLockedEmail` are tested outside the `LINK_EMAILS`/`CONFIRM_EMAILS` arrays because they have extra positional args (export ID + days, change type + factor) that don't fit the uniform tuple shape.
