---
source: src/modules/account/tests/unit/emails.test.ts
sha256: c40021000554c40e0cbdb9b7984cad703b3f0aa4f5fe919a2fc70a920863e2b8
generated_at: 2026-11-08T04:46:52.763770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit test suite for the account email builder functions in `@modules/account/emails`. It asserts the *built content* of every email — template name, action-link URL, resolved copy, locale propagation, and greeting interpolation — because these builders produce plain data objects whose errors (wrong template, swapped token kind, unresolved i18n key) never throw at call time.

## Key elements

- **`LINK_EMAILS`** — const array pairing each link-carrying builder (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `scheduledWithDate`) with its expected template key and `accountFrontendLink` kind.
- **`CONFIRM_EMAILS`** — const array of link-less confirmation builders (`resetConfirmEmail`, `accountDeletedEmail`, `restoredByStaff`, `exportFailedEmail`) with their expected templates.
- **`scheduledWithDate`** — thin wrapper pinning `deletionScheduledEmail`'s purge date to `PURGE_AT` so the builder matches the 3-arg signature of the other link emails.
- **`restoredByStaff`** — wrapper calling `accountRestoredEmail` with `staffVariant = true`.
- **`copySlots`** — extracts every string-valued slot (subject + data, minus `locale` and `linkUrl`) from a built email for copy-resolution checks.
- **`describe('…template each one names')`** — asserts each builder's `.template` matches the expected i18n key and that all ten templates are pairwise distinct.
- **`describe('…action links')`** — verifies `data.linkUrl` equals `accountFrontendLink(kind, { locale, token })`, that three token-kinds produce three distinct URLs, and that the locale is embedded in the URL path.
- **`describe('…the copy')`** — walks every slot asserting non-empty strings that don't match the raw-key pattern `^account\.email\.`; checks name interpolation, locale passthrough, and shared footer deduplication (excluding footers containing `NODE_SUPPORT_EMAIL`).
- **`describe('…data export link')`** — dedicated block for `exportReadyEmail`: its own template, `accountExportLink` URL, expiry-days interpolation, and greeting fallback for empty name.
- **`describe('…two-factor lock notice')` / `…two-factor change notice')`** — per-builder checks for `twoFactorLockedEmail` and `twoFactorChangedEmail` across all change variants (`enrolled`, `removed`, `disabled`, `codes-regenerated`) and both shipped locales.

## Relationships

- **`src/modules/account/emails.ts`** — the module under test; all sixteen builder functions and `greetableName` are imported from here.
- **`src/modules/account/config.ts`** — provides `accountFrontendLink` and `accountExportLink`, used as the reference values against which each builder's `linkUrl` is compared.
- **`tests/support/environment.ts`** — `setEnvironment` is imported (presumably to stub `NODE_SUPPORT_EMAIL` or other env values for the footer-deduplication test).

## Notes

- `setupRequestEmail` deliberately shares the `reset` kind with `resetRequestEmail`; both spend a `password`-type token at `POST /account/password/reset/confirm`. The "each token to its own kind" test therefore excludes it from the three-way distinctness check.
- The "distinct template" test is a structural guard: if two builders accidentally name the same i18n key, every per-email template assertion still passes (both agree), but the set-size check catches it.
- Copy resolution tests treat any value matching `^account\.email\.` as a failure — this is the signature of i18next returning the translation key itself because no entry was found.
- `greetableName` is imported but its usage is not visible in the (truncated) file body; it may be referenced in a section beyond the truncation point.
- Locale tests are limited to `en` and `it`, described as the two "shipped languages."
