---
source: src/modules/account/tests/unit/emails.test.ts
sha256: 8542426cdd2977ff0873931f50fd2fdefe758e3a93696dcdb2c872eec78ee3e5
generated_at: 2026-11-14T19:14:49.645688+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the fourteen account email builder functions exported by `@modules/account/emails`. Because these builders "fail like code" (a wrong `template`, `linkUrl`, or token silently produces a wrong or broken email), the tests assert the fully-built payload: correct template ID, correct link kind and token, resolved i18n copy (not raw keys), and correct locale passthrough.

## Key elements

- **`LINK_EMAILS` / `CONFIRM_EMAILS`** — `as const` data tables pairing each builder with its expected template ID (and link kind, for link emails). Drives `it.each` parameterized tests across four suites.
- **`copySlots(content)`** — helper that flattens `subject` + `data` into `[key, value]` pairs, excluding `locale` and `linkUrl`. Used by every "resolves to real copy" assertion.
- **`scheduledWithDate` / `restoredByStaff`** — thin wrappers that pin the `PURGE_AT` date and the staff-variant boolean (`true`) respectively, so the data tables can use a uniform `(locale, name, token)` signature.
- **Test suites (6 `describe` blocks):**
  - *Template each one names* — correct template ID per email; all templates are pairwise distinct.
  - *Action links* — `data.linkUrl` equals `accountFrontendLink(kind, {locale, token})`; three token-bearing links are pairwise distinct; setup mail carries `termsUrl` and `privacyUrl`; locale appears in the link path.
  - *Copy* — every slot is a non-empty string that is not a raw `account.email.*` key; `greeting` contains the recipient name (no `{{`); locale reaches both `data.locale` and the rendered copy; shared footer is identical across all non-security emails.
  - *Data export link* — `exportReadyEmail` template, link, expiry-days slot, and greeting fallback when name is empty.
  - *Two-factor lock notice* — `twoFactorLockedEmail` template, name interpolation, minute count in body.
  - *Two-factor change notice* — `twoFactorChangedEmail` template distinctness, per-`change`-type copy in both shipped locales.

## Relationships

- **`src/modules/account/emails.ts`** — the module under test; all 15 builder functions (`verifyRequestEmail`, `resetRequestEmail`, …, `greetableName`) are imported from here.
- **`src/modules/account/config.ts`** — provides `accountFrontendLink`, `accountTermsLink`, and `accountExportLink`, which the tests call to compute the expected `linkUrl` / `termsUrl` values.
- **`src/modules/users/index.ts`** — re-exports `privacyFrontendLink`, asserted as the expected `privacyUrl` in the setup-email test.
- **`src/modules/users/config.ts`** — source of `privacyFrontendLink` (imported through the `@modules/users` barrel).
- **`tests/support/environment.ts`** — exports `setEnvironment`, imported for test-environment setup (likely setting locale or feature flags before suites run).

## Notes

- **i18n-missing detection:** i18next returns the key string itself when a translation is absent. Every copy assertion therefore checks `not.toMatch(/^account\.email\./)` in addition to non-emptiness.
- **Footer test caveat:** the shared-footer assertion excludes any footer that contains `process.env.NODE_SUPPORT_EMAIL`, treating those as "security notices" with a deliberately different footer.
- **Token-flow safety:** a dedicated test asserts that the three token-bearing links (verify, reset, restore) are pairwise distinct URLs, guarding against a copy-paste swap that would let one flow's token open another flow's page.
- **`greetableName`** is imported from the emails module but is exercised only in the truncated portion of the file (likely in the sign-in-method / email-change / password-changed suites).
- The file tests in **two shipped locales** (`en`, `it`) for copy-resolution assertions, but uses `en` for structural (template, link) checks.
