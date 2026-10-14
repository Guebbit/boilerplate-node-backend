---
source: src/modules/account/two-factor/methods/email.ts
sha256: 535e7c8f2fb01213812de67c2396e0f808392e83440e789ec7679b1a8ea9e9b9
generated_at: 2026-10-14T14:49:37.078868+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements the **email** two-factor method as a *delivered* code channel: setup and login both reduce to "generate a code, mail it, store its digest on the entry." All shared lifetime/cooldown/attempt logic lives in `../delivered-codes.ts`; this file only wires the email-specific send, eligibility, and verification steps into the `TwoFactorMethodHandler` interface.

## Key elements

- **`maskEmail(email)`** – Exported utility. Redacts the local part to `first***last` (or all-asterisks if ≤ 2 chars) so UIs show a recognisable-but-private address. Done server-side so every client masks identically.
- **`deliver(user, entry, context)`** – Internal. Generates a code via `generateDeliveredCode`, arms it on `entry` (mutates in place; caller persists), builds the i18n'd mail through `twoFactorCodeEmail`, sends it with `sendAccountMail`, and returns a `TwoFactorDelivery` (masked recipient, resend cooldown, `expiresAt`).
- **`emailMethod`** – Exported `TwoFactorMethodHandler` object:
  - `available` – gates on `mailDelivers(mailConfig())`; a deployment with no readable transport must not offer the method.
  - `eligibility` – requires `user.verifiedAt`; unverified addresses are rejected with an i18n reason.
  - `target` – returns `maskEmail(user.email)`.
  - `setup` / `send` – both delegate to `deliver`; setup additionally tags the result with `delivers: true` so the client can distinguish the setup half of the union.
  - `verify` – delegates to `verifyDeliveredCode` with a `{ kind: 'method', method }` scope discriminator.

## Relationships

| Neighbor | Interaction |
|---|---|
| `../delivered-codes.ts` | Source of `generateDeliveredCode`, `armDeliveredCode`, `DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS` — all shared delivered-code mechanics. |
| `../delivered-code-verify.ts` | `verifyDeliveredCode` handles the actual code check; this file passes the user, scope, entry, and raw code. |
| `../registry.ts` | Provides the `TwoFactorMethodHandler` type that `emailMethod` satisfies. |
| `../../emails.ts` | Supplies `twoFactorCodeEmail` (mail body builder), `recipientLocale`, and `greetableName`. |
| `../../services/mail.ts` | `sendAccountMail` is the transport call that actually dispatches the message. |
| `@infrastructure/adapters/config.ts` | `mailConfig()` feeds the `available()` check. |
| `@infrastructure/adapters/mail-transports.ts` | `mailDelivers()` determines whether the configured transport can reach a real inbox. |
| `@infrastructure/i18n/index.ts` | `t()` resolves the "email not verified" eligibility reason string. |
| `@modules/users/index.ts` | Type imports: `UserDocument`, `TwoFactorMethodRecord`. |
| `@types/index.ts` | Type imports: `CallerContext`, `TwoFactorDelivery`. |

## Notes

- **`setup` ≡ `send`.** Enrollment and login perform the identical send; the only difference is the `delivers: true` flag the client uses to pick the populated half of the `TwoFactorSetup` union.
- **`deliver` mutates `entry`.** The calling service (enrollment flow or login flow) is responsible for persisting the entry after the promise resolves.
- **Recipient is read live, not frozen.** The destination address comes from the current `UserDocument` each time; changing the email is itself a re-authenticated action, so no second copy needs syncing.
- **`available()` is deployment-level, not per-user.** It checks transport configuration, while `eligibility` checks per-user state (`verifiedAt`). Both must pass before the method appears to a user.
