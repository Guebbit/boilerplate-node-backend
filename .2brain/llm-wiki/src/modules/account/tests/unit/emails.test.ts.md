---
source: src/modules/account/tests/unit/emails.test.ts
sha256: 7505aba8f5bfbdabc55edb64112e093513e83c90505b4779bae3a77f9372bf7f
generated_at: 2026-10-14T09:20:42.420716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the account email builders in `@modules/account/emails`. Because these builders produce data (not throw on errors), a wrong template, swapped token, or broken interpolation silently sends the wrong email to a real user. The suite therefore asserts the *built content*—template name, link URL, copy resolution, locale propagation, and structural invariants—across every email variant and both shipped locales (`en`, `it`).

## Key elements

- **`LINK_EMAILS`** – A `const` array pairing each link-bearing builder (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `deleteRequestEmail`) with its expected template key and `accountFrontendLink` kind.
- **`CONFIRM_EMAILS`** – Same shape for the three link-less confirmations (`resetConfirmEmail`, `deleteConfirmEmail`, `exportFailedEmail`).
- **`copySlots(content)`** – Helper that flattens `subject` + `data` into entries, filtering out `locale`, `pageMetaLinks`, and `linkUrl` so the remaining slots can be individually asserted for non-empty, non-key-echoed strings.
- **`describe('account emails — the template each one names')`** – Verifies each builder names the correct i18n template and that all seven templates are pairwise distinct.
- **`describe('account emails — the action links')`** – Asserts each builder delegates to `accountFrontendLink` with the correct kind, that three different kinds produce three different URLs, and that the recipient's locale appears in the link path.
- **`describe('account emails — the copy')`** – Checks every copy slot resolves to real text (not an i18next key), that `{name}` interpolation lands, locale reaches the template, `pageMetaLinks` is `[]` (not `undefined`), and all emails share one footer.
- **`describe('account emails — the data export link')`** – Tests `exportReadyEmail`: template, `accountExportLink` delegation, expiry days, greeting fallback when name is empty, and per-locale copy.
- **`describe('account emails — the two-factor lock notice')`** – Tests `twoFactorLockedEmail`: template, copy in both locales, minutes value, name interpolation.
- **`describe('account emails — the two-factor change notice')`** – Tests `twoFactorChangedEmail`: template, all three `change` values produce distinct bodies, factor name appears, copy is real in both locales.
- **`describe('account emails — the name in a greeting')`** – Verifies every builder passes the recipient's name into the greeting (or falls back to a plain greeting).

## Relationships

- **`src/modules/account/emails.ts`** – The module under test. All `describe` blocks call its exported builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `resetConfirmEmail`, `deleteRequestEmail`, `deleteConfirmEmail`, `twoFactorChangedEmail`, `twoFactorLockedEmail`, `exportFailedEmail`, `exportReadyEmail`, `greetableName`) and assert on the returned `{ template, subject, data }` shape.
- **`src/modules/account/config.ts`** – Provides `accountFrontendLink` and `accountExportLink`, which the tests use as the *expected* value in link-URL assertions. The tests confirm the builders delegate to these helpers rather than constructing URLs themselves.

## Notes

- `setupRequestEmail` intentionally shares the `'reset'` kind with `resetRequestEmail` (both spend a `password`-type token at `POST /account/reset-confirm`), so it is excluded from the "each token to its own kind" uniqueness check.
- The `pageMetaLinks` must be `[]`, not `undefined`—the renderer iterates it, and `undefined` would crash the template rather than render an empty `<head>`.
- The distinct-template test exists because individual per-builder assertions would still pass if two builders accidentally pointed at the same template.
- Copy-slot checks guard against i18next returning the key string (e.g. `account.email.verify-request.intro`) when a translation is missing—a silent failure that renders garbage in the inbox.
- Tests cover exactly two locales (`en`, `it`), described in-file as "both shipped languages."
