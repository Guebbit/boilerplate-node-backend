---
source: src/modules/account/emails.ts
source_sha256: 59f89349bbfe2e5906e7344a98ff3e05bc49080f6d879585a8d92f67a30af892
context_sha256: 31ad8ace284ea2bb7d41bd53d9d5c967fcbabbc20f38df75bb175838ef0e7025
generated_at: 2026-11-22T03:29:26.151384+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/emails.ts

## Purpose
Holds the copy for every email the account module sends, resolved into finished strings. Templates only interpolate and never translate, because emails render later in `src/infrastructure/adapters/email.worker.ts` with no request or locale store. Each builder therefore takes the recipient's locale explicitly, binds its own translator `t`, and returns a complete `EmailContent` (template name, subject and render data).

## Key elements
- `greetableName(user, address)` is exported. It returns `user.username` only when the user has `verifiedAt` set and `address` matches `user.email` after `normalizeEmail`. Otherwise it returns `''`.
- `greetingFor` (private) returns the translated "greeting-anonymous" line for an empty name, or the template's own `...greeting` key with `{ name }`.
- `accountMail` (private) is the shared frame. It takes `template` (`account.<flow>`), `locale`, `name`, a `body(t)` callback and an optional `security` flag.
  - Copy keys are `account.email.<flow>.*`.
  - It fills `subject`, `pageMetaTitle`, `greeting`, the body slots and `footer`.
  - With `security`, the footer is `account.email.footer-support` naming `supportEmail()`. Otherwise it is `email.footer`.
- Builders, all returning `EmailContent`:
  - `verifyRequestEmail(locale, name, token, kind)`: the verification link. `kind` is `'verify'` (default) or `'email-change'`.
  - `emailChangeNoticeEmail(locale, name, newEmail, undoToken)`: a security notice to the OLD address, sent when a change is requested. It carries the undo link (`email-undo`).
  - `resetRequestEmail(locale, name, token)`: the password reset link.
  - `setupRequestEmail(locale, name, token)`: account setup for admin-created accounts. It also links the Terms and the privacy notice.
  - `twoFactorCodeEmail(locale, name, code, minutes)`: a login code with no link.
  - `reauthCodeEmail(locale, name, code, minutes)`: a step-up code for accounts with no password, with no link.
  - `twoFactorChangedEmail(locale, name, change, method)`: a security notice. The body key is `body-${change}`.
- Types: `TwoFactorChange` (`'enrolled' | 'removed' | 'disabled' | 'codes-regenerated'`) and `SignInMethodChange` (`'linked' | 'unlinked'`).
- `signInMethodChangedEmail` is documented as a notice sent when a provider is linked to or unlinked from an account. The rest of the file is not shown here.

## Relationships
- `src/infrastructure/adapters/config.ts` supplies `supportEmail()` for the security footer.
- `src/infrastructure/adapters/mailer.ts` supplies the `EmailContent` type that every builder returns.
- `src/infrastructure/i18n/index.ts` supplies `translator` and `getDefaultLocale`.
- `src/modules/account/config.ts` supplies `accountFrontendLink`, `accountExportLink`, `accountTermsLink` and the `AccountLinkKind` type. These build the links in the emails.
- `src/infrastructure/persistence/normalize-email.ts` supplies `normalizeEmail`, used by `greetableName`.
- `@modules/users` supplies `privacyFrontendLink`, used in the setup email.
- `@types` supplies `CallerContext`.
- The service files in the neighbor list are likely callers of these builders. The visible code confirms only that a comment references `password-reset-request.ts` (`requestAccountSetup`).

## Notes
- Pass `name` through `greetableName`. A display name is user-supplied text. Printing it to an unverified address would put attacker-chosen text in a stranger's inbox from the shop's own domain.
- Code emails (`twoFactorCodeEmail`, `reauthCodeEmail`) deliberately carry no `linkUrl`, so recipients are not taught to click a button in a mail that also carries a code.
- `template` is passed as a literal string and declared `readonly`. Cross-cutting sweeps read lines starting `template:` as published outbox names, and the name is shared with a "twin repository".
- Security notices (`security: true`) are `emailChangeNoticeEmail` and `twoFactorChangedEmail`. They use the support-address footer.
- `emailChangeNoticeEmail` is sent when the change is requested, not when it completes. Its undo link lasts 7 days and survives a password change, according to the doc comment.
- `setupRequestEmail` reuses the same link, token type and TTL as the reset email. Only the copy differs.
