---
source: src/modules/account/two-factor/methods/email.ts
sha256: 6075455e651a535f3bd5f608347c2ea5ca71f5049f4e2dd4a1917ce7750bc2ff
generated_at: 2026-09-23T18:18:42.807654+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/methods/email.ts

## Purpose

Implements the email channel for two-factor authentication as a "delivered code" method: mint a one-time code, mail it to the user's verified address, and verify by comparing against the stored digest. All code-lifetime logic (TTL, cooldown, attempt ceiling) is delegated to the shared `delivered-codes` module so that any future delivered channel (SMS, etc.) reuses the same primitives.

## Key elements

- **`emailMethod`** (export) — The single public export; a `TwoFactorMethodHandler` object registered in the 2FA registry. Exposes `name: 'email'`, `delivers: true`, and the five lifecycle hooks (`available`, `eligibility`, `target`, `setup`, `send`, `verify`).
- **`maskEmail`** (module-private) — Redacts the local part of an address (`ada.lovelace@example.com` → `a***e@example.com`) so UI surfaces can display a recognisable but non-sensitive label.
- **`deliver`** (module-private) — The core send path: generates a code via `generateDeliveredCode`, arms it on the entry via `armDeliveredCode`, builds a localised email through `twoFactorCodeEmail`, and enqueues it via `enqueueEmail` at **high** priority. Returns a `TwoFactorDelivery` with the masked recipient and expiry.
- **`setup` / `send`** hooks — Both call the same `deliver`; `setup` additionally tags the result with `delivers: true` so the client can populate the `TwoFactorSetup` union.
- **`verify`** hook — Calls `consumeDeliveredCode(entry, code)` to check (and atomically consume) the stored digest.
- **`available`** hook — Returns `true` only when `isDemoMode()` is set **or** `NODE_SMTP_HOST` is present in the environment.
- **`eligibility`** hook — Requires `user.verifiedAt` to be truthy; otherwise returns `enrollable: false` with an i18n reason string.

## Relationships

- **`../delivered-codes.ts`** — Source of all code-lifecycle primitives (`generateDeliveredCode`, `armDeliveredCode`, `consumeDeliveredCode`) and the two timing constants (`DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`). This file contains no code generation or verification logic of its own.
- **`../registry.ts`** — Provides the `TwoFactorMethodHandler` type that `emailMethod` must satisfy; the registry is what the 2FA service iterates over to find the right channel.
- **`../../emails.ts`** — Supplies `twoFactorCodeEmail`, which renders the subject line and template body for the code-delivery email.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the transport; this file never touches SMTP directly.
- **`@infrastructure/i18n`** (`catalog`, `context`, `index`) — `t()` localises the eligibility reason; `getDefaultLocale()` is the last-rescue locale when neither the user nor the caller specifies one.
- **`@infrastructure/runtime/demo-profile`** — `isDemoMode()` lets the demo profile offer email 2FA without a real SMTP host.
- **`@modules/users`** (`index`, `model`) — Provides the `UserDocument` and `TwoFactorMethodRecord` types that parameterise every hook.
- **`@types`** (`auth-context`, `index`) — `CallerContext` carries the request-level locale; `TwoFactorDelivery` is the return shape of `deliver`.

## Notes

- **`setup` and `send` are the same operation.** The only difference is the extra `delivers: true` flag on the `setup` result, which tells the client which half of the `TwoFactorSetup` discriminated union is populated. There is no distinct "enrollment" email.
- **Recipient locale resolution** is `user.locale → context.locale → getDefaultLocale()`. The email copy is fully rendered before the job is enqueued, so the mail worker never needs a locale.
- **The destination address is read live** from `user.email` at send time rather than frozen at enrollment, because changing the email address is itself a fresh-authenticated, re-verified action.
- **`entry.codeExpiresAt` is asserted non-null** (`!`) in the `deliver` return because `armDeliveredCode` was called immediately before; the assertion is safe but will throw at runtime if the contract is ever broken.
- **`maskEmail` masks server-side** so two different front-ends cannot redact the same address differently.
