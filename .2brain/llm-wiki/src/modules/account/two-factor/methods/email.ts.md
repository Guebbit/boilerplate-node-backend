---
source: src/modules/account/two-factor/methods/email.ts
sha256: 5ce25c4cca66f038c9a782d9f4bcb1069f04afc155dab7c4952fb8455e52c2ec
generated_at: 2026-10-29T03:07:21.929364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements email as a "delivered" two-factor method: setup and verification both reduce to minting a one-time code, mailing it, and recording its digest. Serves as the concrete `TwoFactorMethodHandler` for the `email` method in the 2FA registry, and is shared verbatim by the step-up re-authentication flow.

## Key elements

- **`maskEmail`** (module-private) – Masks a local-part of an address (`a***e@domain`) so the UI can show a recognisable but non-reversible identifier. Kept server-side so all clients agree on the redaction.
- **`deliverEmailCode`** (exported) – The single delivery primitive: generates a code via `generateDeliveredCode`, arms it on the supplied `slot` (mutates in place; caller persists), builds the mail body with the recipient's own locale, and sends it through `sendAccountMail` at high priority. Returns a `TwoFactorDelivery` containing the masked recipient, resend cooldown, and expiry. Accepts a `buildMail` callback so the same send powers both the 2FA and re-auth contexts.
- **`emailMethod`** (exported) – The `TwoFactorMethodHandler` object registered under the name `'email'`:
  - `available()` – True only when the configured transport can actually deliver (`mailDelivers(mailConfig())`).
  - `eligibility()` – Requires `user.verifiedAt` to be set; otherwise returns a localised "unverified" reason.
  - `target()` – Returns the masked email for display.
  - `setup()` / `send()` – Both delegate to `deliverEmailCode` with `twoFactorCodeEmail` as the builder.
  - `verify()` – Delegates to `verifyDeliveredCode` with a `{ kind: 'method', method: entry.method }` scope.

## Relationships

- **`../delivered-codes.ts`** – Source of `generateDeliveredCode`, `armDeliveredCode`, `DELIVERED_CODE_TTL_MS`, and `DELIVERED_CODE_RESEND_SECONDS`. All code-lifetime, cooldown, and attempt logic lives there, shared across every future delivered channel.
- **`../delivered-code-verify.ts`** – `verifyDeliveredCode` performs the actual digest comparison and attempt accounting during `verify`.
- **`../registry.ts`** – Provides the `TwoFactorMethodHandler` contract that `emailMethod` satisfies.
- **`../../emails.ts`** – Supplies `twoFactorCodeEmail` (mail-body builder), `recipientLocale`, and `greetableName` for composing the outgoing message.
- **`../../services/mail.ts`** – `sendAccountMail` is the transport-level send call (high-priority queue).
- **`@infrastructure/adapters/config.ts` / `mail-transports.ts`** – `mailConfig` and `mailDelivers` gate the `available()` check so the method is hidden when no real transport exists.
- **`@infrastructure/i18n`** – `t` localises the eligibility rejection reason.
- **`@modules/users`** – Type imports (`UserDocument`, `DeliveredCodeState`) for the slot and account record shape.
- **`@types`** – `CallerContext` (locale fallback) and `TwoFactorDelivery` (return shape).

## Notes

- **Destination is live, not frozen.** The email address is read from the current `user.email` at send time rather than stored at enrollment. Changing the address is itself a re-verified action, so no stale copy exists.
- **Locale is resolved before the job is published.** `recipientLocale` bakes the language into the mail body; the async worker never needs a locale.
- **`deliverEmailCode` is the shared choke-point.** Both the 2FA `setup`/`send` and the re-auth service call it, guaranteeing a single implementation of cooldown, masking, and expiry. If you change delivery semantics, change it here.
- **`slot` is mutated in place.** The caller (typically the account service) is responsible for persisting the updated `DeliveredCodeState` after the promise resolves.
- **`expiresAt` in the return is non-null by construction** because `armDeliveredCode` sets it immediately before the mail is queued; the `!` assertion is safe but only within this call site.
