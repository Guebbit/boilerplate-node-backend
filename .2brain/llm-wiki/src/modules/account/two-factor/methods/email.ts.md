---
source: src/modules/account/two-factor/methods/email.ts
sha256: 4de90463414329e564dde0e896adfda5e75dc19163ea91e70a1fbfb9c0bfa211
generated_at: 2026-10-15T10:17:23.496395+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements the email delivery method for two-factor authentication and step-up re-authentication. It mints a time-limited code, mails it to the account's verified address, and arms the code's digest on the user record. All channel-agnostic concerns (TTL, cooldown, attempt limits) are delegated to the shared delivered-code module, so every future delivery channel inherits the same constraints.

## Key elements

- **`maskEmail(email)`** – Redacts a local-part (e.g. `a***e@example.com`) server-side so every client sees identical output. Exported for use in `target`, `setup`, and `send` results.
- **`deliverEmailCode(user, slot, context, buildMail)`** – Core delivery primitive: generates a code, arms it on `slot` (mutating it), resolves the recipient's locale, builds the mail body via the supplied `buildMail` function, and sends through `sendAccountMail` at high priority. Returns a `TwoFactorDelivery` with masked recipient, resend cooldown, and expiry. Shared by both the 2FA email method and the re-auth flow.
- **`emailMethod`** – The `TwoFactorMethodHandler` object registered in the two-factor registry. Exposes `available`, `eligibility`, `target`, `setup`, `send`, and `verify`. Setup and send both funnel through `deliverEmailCode`; verify delegates to `verifyDeliveredCode`.

## Relationships

- **`../delivered-codes.ts`** – Source of `generateDeliveredCode`, `armDeliveredCode`, `DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`. This file owns no code-lifetime logic of its own.
- **`../delivered-code-verify.ts`** – Provides `verifyDeliveredCode`, called by `emailMethod.verify`.
- **`../registry.ts`** – Defines the `TwoFactorMethodHandler` interface that `emailMethod` satisfies.
- **`../../emails.ts`** – Supplies `twoFactorCodeEmail` (mail body builder), `recipientLocale`, and `greetableName`.
- **`../../services/mail.ts`** – Provides `sendAccountMail`, the transport-agnostic send wrapper.
- **`@infrastructure/adapters/config.ts`** – `mailConfig` is read inside `available` to determine whether a usable transport is configured.
- **`@infrastructure/adapters/mail-transports.ts`** – `mailDelivers` is the predicate that gates method visibility.
- **`@infrastructure/i18n`** – `t` localizes the "unverified address" eligibility message.
- **`@modules/users`** – `UserDocument` and `DeliveredCodeState` types shape the function signatures.
- **`@types`** – `CallerContext` (locale/caller identity) and `TwoFactorDelivery` (return shape).
- **`../../services/reauth.ts`** – Shares `deliverEmailCode` as its delivery path (noted in the JSDoc; keeps cooldown/lifetime/masking in sync between 2FA and step-up).

## Notes

- `deliverEmailCode` **mutates** the `slot` parameter in place; the calling service is responsible for persisting the updated `DeliveredCodeState`.
- Mail body (including locale and greeting) is fully resolved **before** the job is enqueued, so the worker never needs locale or user data.
- `available` checks **deployment config** (is a deliverable transport configured?), while `eligibility` checks **user state** (is the address verified?). A deployment with no working mail transport hides the method entirely.
- The destination email is read from the live user record at send time, not frozen at enrollment, because changing the address is itself a verified action.
