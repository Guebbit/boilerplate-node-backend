---
source: src/modules/account/two-factor/methods/email.ts
sha256: 89f398d7689d99d1e643f748063012e4cbabe0afca05e350c76b28c0e93cb1f9
generated_at: 2026-09-27T14:38:11.042655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements the email channel of two-factor authentication as a `TwoFactorMethodHandler`. Because email is a *delivered* method (not a TOTP-style computed method), both setup and login reduce to the same three steps: generate a code, arm its digest on the method entry, and mail it to the user. All code-lifecycle policy (TTL, resend cooldown, attempt ceiling) is delegated to the shared `delivered-codes` module so future channels can reuse it.

## Key elements

- **`maskEmail(email)`** – Redacts an address to `f***o@domain` form. Lives here (server-side) so every client renders the same masking.
- **`deliver(user, entry, context)`** – Core action. Calls `generateDeliveredCode` → `armDeliveredCode` (mutates `entry`) → composes the i18n'd email via `twoFactorCodeEmail` → dispatches with `sendAccountMail` → returns a `TwoFactorDelivery` including the masked recipient, resend-after window, and `expiresAt`.
- **`emailMethod`** (exported) – The `TwoFactorMethodHandler` record:
  - `available` – True only in demo mode or when `NODE_SMTP_HOST` is set.
  - `eligibility` – Requires `user.verifiedAt`; otherwise reports a localized "unverified" reason.
  - `target` – Returns the masked email for UI display.
  - `setup` / `send` – Both call `deliver`; `setup` additionally stamps `delivers: true` as the `TwoFactorSetup` discriminator.
  - `verify` – Delegates to `consumeDeliveredCode`.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) – Provides `t()` for the localized "unverified" eligibility reason.
- **`@infrastructure/runtime/demo-profile.ts`** – `isDemoMode()` gates `available` so demo can offer email 2FA without a real SMTP host.
- **`@types`** (`index.ts`, `auth-context.ts`) – Source of `CallerContext` and `TwoFactorDelivery` types.
- **`@modules/users`** (`index.ts`, `model.ts`) – Source of `UserDocument` and `TwoFactorMethodRecord` types.
- **`../../emails`** – `twoFactorCodeEmail` (compose the code email) and `recipientLocale` (pick the user's language at send time).
- **`../../services/mail`** – `sendAccountMail` performs the actual SMTP/outbox dispatch.
- **`../registry`** – `TwoFactorMethodHandler` is the contract `emailMethod` satisfies; the registry collects all handlers.
- **`../delivered-codes`** – Owns `generateDeliveredCode`, `armDeliveredCode`, `consumeDeliveredCode`, and the `DELIVERED_CODE_*` constants. This file contains *no* code-expiry or attempt logic of its own.

## Notes

- **No expiry/attempt logic here.** All time-based and rate-limiting rules live in `delivered-codes.ts`; adding a new delivered channel (SMS, etc.) reuses that module without touching this file's policy.
- **`entry.codeExpiresAt!`** uses a non-null assertion immediately after `armDeliveredCode` sets it. Safe by construction, but a refactor that reorders those calls would break the assumption.
- **`setup` and `send` are the same call.** The only difference is the `delivers: true` discriminator the client reads to know which half of `TwoFactorSetup` is populated.
- **Locale is resolved at send time**, not in the mail worker. The email body is fully rendered before `sendAccountMail` is invoked, so the worker never needs locale context.
- **Eligibility is `verifiedAt`-gated, not a flag.** The file's doc comment stresses that an unverified mailbox is not a second factor; there is no admin override path in this module.
