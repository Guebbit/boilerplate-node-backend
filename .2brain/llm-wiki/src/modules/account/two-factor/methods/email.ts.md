---
source: src/modules/account/two-factor/methods/email.ts
source_sha256: 26adc15e48220745fcf02dcd903b689c274bc2518a105bdb3d98095584ed961f
context_sha256: efcf4c68fb0a56c363db07bd91e336b24d22ea836d7a9555be197cc46033c8ea
generated_at: 2026-11-22T04:11:25.622456+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/methods/email.ts

## Purpose
Implements the email two-factor method as a "delivered" method: setup and login both mint a code, mail it, and record its digest. Code lifetime, cooldown and attempt limits are not defined here. They live in `src/modules/account/two-factor/delivered-codes.ts`, which is shared across delivery channels.

## Key elements
- **`maskEmail`** (private): turns `ada.lovelace@example.com` into `a***e@example.com`. Local parts of 2 characters or fewer are fully starred. Masking happens server-side so all clients redact identically.
- **`deliverEmailCode(user, slot, context, buildMail)`**: generates a code and arms it on `slot` (mutating it; the calling service persists). It builds the mail in the recipient's locale, using the user's name or email as the greeting and the TTL in minutes. It sends the mail with `sendAccountMail(..., { urgent: true })`. It resolves to a `TwoFactorDelivery` containing `method: 'email'`, the masked `sentTo`, `resendAfter` and an ISO `expiresAt`. The step-up re-authentication flow reuses it with a different `buildMail`.
- **`emailMethod`** (`TwoFactorMethodHandler`): `name: 'email'`, `delivers: true`.
  - `available`: `mailDelivers(mailConfig())`.
  - `eligibility`: enrollable only if `user.verifiedAt` is set. Otherwise it returns the reason `t('account.two-factor.email-unverified')`.
  - `target`: the masked address.
  - `setup`: the same delivery as `send`, plus `delivers: true` as the discriminator for the `TwoFactorSetup` payload.
  - `send`: `deliverEmailCode` with `twoFactorCodeEmail`.
  - `verify`: delegates to `verifyDeliveredCode` with `{ kind: 'method', method: entry.method }`.

## Relationships
- `src/modules/account/two-factor/delivered-codes.ts`: provides `generateDeliveredCode`, `armDeliveredCode`, `DELIVERED_CODE_TTL_MS` and `DELIVERED_CODE_RESEND_SECONDS`.
- `src/modules/account/two-factor/delivered-code-verify.ts`: supplies `verifyDeliveredCode`.
- `src/modules/account/two-factor/registry.ts`: supplies the `TwoFactorMethodHandler` type that `emailMethod` implements.
- `src/modules/account/emails.ts`: supplies `twoFactorCodeEmail`, `recipientLocale` and `greetableName`.
- `src/modules/account/services/mail.ts`: `sendAccountMail` queues the mail.
- `src/infrastructure/adapters/config.ts` and `src/infrastructure/adapters/mail-transports.ts`: `mailConfig` and `mailDelivers` decide whether the method is available.
- `src/infrastructure/i18n/index.ts`: `t` provides the ineligibility message.
- `src/modules/users/index.ts`: provides the `UserDocument` and `DeliveredCodeState` types.
- `src/types/index.ts`: provides `CallerContext` and `TwoFactorDelivery`.
- `src/domain-primitives/time.ts`: `MINUTE_MS` converts the TTL to minutes.
- `src/modules/account/services/reauth.ts` is listed as a neighbor. The comments say step-up re-auth uses `deliverEmailCode`, but this file does not import it.

## Notes
- The method is gated on `verifiedAt` because email 2FA is only as strong as the mailbox behind it.
- The destination is read from the live user record, not stored at enrollment. Changing the address is itself a re-verified action, so no second copy needs syncing.
- `available` is false for deployments whose mail transport doesn't reach an inbox, such as `smtp` without a host. The method is then not offered.
- Mail is sent as urgent because a user is waiting on a login screen.
- The finished, localized mail is built before the job is published, so the worker needs no locale.
