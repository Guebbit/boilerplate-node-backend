---
source: src/modules/account/tests/unit/emails.test.ts
source_sha256: 31b8b39478005d9de080719ee29582e45c2553faf89730795b823fb2c174160f
context_sha256: 7ae6cf7ef494935666732727e3fb526c14bfbff42b5a8e63cbe8dc0466e6b4e2
generated_at: 2026-11-22T04:05:15.797547+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose
Unit tests for the account email builders in `@modules/account/emails`. These builders return plain data (`template`, `subject`, `data`) but fail silently when wrong: a wrong template, a wrong link, a swapped token, or an uninterpolated name never throws. So the tests assert the built content itself: the template name, the full link URL, the interpolated copy, and the locale handling.

## Key elements
- **Fixtures**: `NAME` (`'Ada Lovelace'`), `TOKEN`, and `PURGE_AT` (the pinned deletion due date).
- **Adapters**:
  - `scheduledWithDate` pins the due date so `deletionScheduledEmail` matches the `(locale, name, token)` shape of the other link builders.
  - `restoredByStaff` calls `accountRestoredEmail` with the staff flag set to `true`.
- **`LINK_EMAILS`**: a table of `[name, builder, template, frontendLinkKind]` for the four link-carrying emails: verify (`verify`), reset (`reset`), setup (`setup`) and deletion-scheduled (`restore`).
- **`CONFIRM_EMAILS`**: a table of `[name, builder, template]` for the link-less emails: reset-confirm, account-deleted, account-restored and export-failed.
- **`copySlots`**: flattens `subject` plus `data` into `[key, value]` pairs, excluding `locale` and `linkUrl`, so every string slot can be checked.
- **Describe blocks visible**:
  - *Template each one names*: each builder renders its expected template, and all templates are distinct.
  - *Action links*:
    - `linkUrl` equals `accountFrontendLink(kind, { locale, token })`.
    - Verify, reset and restore links differ from each other.
    - The setup mail carries `termsUrl` and `privacyUrl`, checked against `accountTermsLink` / `privacyFrontendLink` (paths `/it/terms`, `/it/privacy`).
    - The locale appears in the link path.
  - *Copy*: every slot is a non-empty string and not an echoed `account.email.*` i18n key. The name is interpolated with no `{{` left over. `locale` is carried through and the Italian subject differs from the English one. All emails share one footer, except the security notices that name support.
  - *Data export link*: `exportReadyEmail` uses the `account.export-ready` template. Its link equals `accountExportLink` (`/it/account-export`). The expiry text contains the day count. The greeting is `Hello!` when the name is empty. Copy resolves in `en` and `it`.
  - *Two-factor lock notice*: `twoFactorLockedEmail` uses the `account.two-factor-locked` template, resolves real copy in `en` and `it`, and names the name and the minutes.
  - *Two-factor change notice*: `twoFactorChangedEmail` uses the `account.two-factor-changed` template and is checked across the `enrolled`, `removed`, `disabled` and `codes-regenerated` changes. The rest of this block is not shown.

## Relationships
- **`src/modules/account/emails.ts`**: the module under test. It supplies all the builders plus `greetableName`.
- **`src/modules/account/config.ts`**: supplies `accountFrontendLink`, `accountTermsLink` and `accountExportLink`, used as the expected values for the link assertions.
- **`src/modules/users/index.ts`**: supplies `privacyFrontendLink`, used to check the privacy URL in the setup mail. `src/modules/users/config.ts` is a graph neighbor but is not referenced directly in the visible code.
- **`tests/support/environment.ts`**: the test imports `setEnvironment` from `@tests/environment`. No call to it appears in the visible portion.

## Notes
- The test does not retest link construction. `accountFrontendLink` and `frontendLink` have their own suites (`config.test.ts` and `frontend-link.test.ts`). This file checks only that each builder picks the right kind and passes locale and token through unchanged.
- The footer test filters out emails whose footer contains `process.env.NODE_SUPPORT_EMAIL`. These are the security notices that name support, and the remaining footers must all be identical.
- The `setup` kind spends the same `password`-type token as reset, but from a page that asks for the Terms tick.
- The copy checks detect untranslated keys by rejecting values that start with `account.email.`.
- Both `en` and `it` locales are exercised.
