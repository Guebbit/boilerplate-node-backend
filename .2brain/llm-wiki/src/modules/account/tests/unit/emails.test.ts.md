---
source: src/modules/account/tests/unit/emails.test.ts
sha256: c85eb6f528f23076304ad16d2e84d82d25c2bdd515fa89653a40fb51e2a38f1d
generated_at: 2026-10-29T03:04:10.675470+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the account email-builder functions in `@modules/account/emails`. Because these builders are pure data-shapers that never throw on a wrong template, link kind, or token, the suite asserts the *built content itself*: correct template ID, correct delegated link URL, resolved (non-raw-key) copy, name interpolation, locale propagation, and cross-email invariants (distinct templates, shared footer, unique link kinds).

## Key elements

- **`LINK_EMAILS`** — const table of 4 link-bearing builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `deletionScheduledEmail`) paired with their expected template ID and `accountFrontendLink` kind.
- **`CONFIRM_EMAILS`** — const table of 4 no-link confirmation builders (`resetConfirmEmail`, `accountDeletedEmail`, `accountRestoredEmail`, `exportFailedEmail`) paired with their template ID.
- **`copySlots`** — helper that flattens a built email into `[key, value]` pairs, excluding `locale` and `linkUrl`, for use in "resolves to real copy" assertions.
- **`scheduledWithDate`** / **`restoredByStaff`** — thin wrappers pinning `PURGE_AT` and the staff flag so the table-driven tests match the other builders' arity.
- **Describe blocks** — one per concern: template IDs, action-link delegation, copy resolution & interpolation, data-export link, two-factor lock notice, two-factor change notice, greeting/name handling.

## Relationships

- **`src/modules/account/emails.ts`** — the module under test; every builder function and `greetableName` is imported here.
- **`src/modules/account/config.ts`** — provides `accountFrontendLink` and `accountExportLink`; the suite calls these to compute the *expected* URL and asserts the builder delegated correctly (right kind, locale, token).
- **`tests/support/environment.ts`** — `setEnvironment` is imported to configure the test runtime (i18n / locale context) before email builders run.

## Notes

- `setupRequestEmail` intentionally shares the `reset` link kind with `resetRequestEmail`; the "each token to its own kind" test excludes it from the uniqueness set (only `verify`, `reset`, `restore` are compared).
- Copy assertions reject any value matching `/^account\.email\./` — this catches i18next falling back to the raw key when a translation is missing.
- `PURGE_AT` is a fixed `Date` (2026-11-05) so the deletion-scheduled template test is deterministic.
- The suite verifies `data.locale` is set (drives `<html lang>` in the renderer) *and* that the actual copy differs between `en` and `it`, proving locale reached `translator()`.
- Footer is asserted to be a single shared string across all 10+ email variants.
