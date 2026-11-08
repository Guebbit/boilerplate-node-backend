---
source: src/modules/account/two-factor/methods/email.ts
sha256: 16aaf47b3ccaab84dac4a5e052b1d742157b79afc736a6b495bf888b214a1512
generated_at: 2026-11-08T04:52:37.764149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements the email two-factor method as a "delivered code" handler: both setup and login reduce to minting a one-time code, mailing it to the account's verified address, and recording its digest. Code lifecycle (TTL, resend cooldown, attempt ceiling) is delegated to the shared `delivered-codes` module so every future delivery channel inherits the same rules.

## Key elements

- **`maskEmail(email)`** (private) — Redacts an address for display (`a***e@example.com`). Defined here rather than in a shared utility so the redaction logic lives in exactly one place server-side.
- **`deliverEmailCode(user, slot, context, buildMail)`** (exported) — Generates a code via `generateDeliveredCode`, arms it on the mutable `slot`, builds the localized mail body, sends it through `sendAccountMail`, and returns a `TwoFactorDelivery` (method, masked recipient, resend cooldown, expiry). Shared by both the 2FA setup/login flow and step-up re-authentication.
- **`emailMethod`** (exported, `TwoFactorMethodHandler`) — The handler object registered in the 2FA registry. Wires `available` (mail transport check), `eligibility` (requires `verifiedAt`), `target` (masked address), `setup`, `send`, and `verify` to the pieces above.

## Relationships

- **`../delivered-codes.ts`** — Source of `armDeliveredCode`, `generateDeliveredCode`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_TTL_MS`. Owns the code lifecycle; this file consumes it.
- **`../delivered-code-verify.ts`** — Provides `verifyDeliveredCode`, used by `emailMethod.verify`.
- **`../registry.ts`** — Supplies the `TwoFactorMethodHandler` interface that `emailMethod` must satisfy; the registry consumes the handler.
- **`../../emails.ts`** — Supplies `twoFactorCodeEmail` (mail template), `recipientLocale`, and `greetableName` for composing the outgoing message.
- **`../../services/mail.ts`** — Supplies `sendAccountMail`, the actual transport call.
- **`../../services/reauth.ts`** — Also calls `deliverEmailCode` for step-up re-authentication, ensuring identical cooldown/lifetime semantics.
- **`@infrastructure/adapters/config.ts`** / **`mail-transports.ts`** — `mailConfig` and `mailDelivers` gate `emailMethod.available`: the method is hidden when no functional transport is configured.
- **`@infrastructure/i18n`** — `t()` localizes the eligibility-denial reason string.
- **`@modules/users`** — `UserDocument` and `DeliveredCodeState` types shape the handler's inputs.
- **`@types`** — `CallerContext` (caller locale for mail) and `TwoFactorDelivery` (return shape).
- **`@domain-primitives/time.ts`** — `MINUTE_MS` used to convert the code TTL into a human-readable minute count for the mail body.

## Notes

- `setup` and `send` are intentionally identical in logic; `setup` merely adds `delivers: true` to the payload so a client can distinguish which half of `TwoFactorSetup` is populated.
- Eligibility is hard-gated on `user.verifiedAt`: an unverified mailbox is explicitly rejected as a second factor. The destination address is always read from the live user record (changing it is itself a re-verified action), so no stale copy is stored.
- The mail body (including locale) is fully resolved before the async job is published; the mail worker never needs to look up a locale.
- `expiresAt` is asserted non-null (`slot.codeExpiresAt!`) because `armDeliveredCode` is called immediately before the return.
