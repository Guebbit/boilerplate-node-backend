---
source: src/modules/payments/config.ts
sha256: 81a5d4ad9ee405f35ee6939b190b7e537778ef6a3196975298ff735ea8e86cf8
generated_at: 2026-10-29T05:02:07.648120+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/config.ts

## Purpose

Centralises every deployment-tunable payment value (bank-transfer account details, provider selection, webhook secrets, grace windows) behind a single `defineConfig` call, and exposes typed accessor functions so that consumers read the value at call-site rather than transcribing their own fallback. Follows the same per-call-read pattern as `@modules/inventory`'s config.

## Key elements

- **`paymentsConfig`** — the `defineConfig` declaration: shape of all `NODE_PAYMENT_*` / `NODE_BANK_TRANSFER_*` variables plus the boot-time `check`.
- **`bankTransferBeneficiary` / `bankTransferIban` / `bankTransferIbanFriendly` / `bankTransferBic` / `bankTransferHoldHours` / `bankTransferEnabled`** — typed accessors for the bank-transfer block; `IbanFriendly` groups the IBAN into 4-char blocks for display.
- **`listPaymentMethods(): PaymentMethodInfo[]`** — returns the methods this deployment offers (card, bank_transfer, or empty); the single source of truth both `GET /payments/methods` and checkout consult.
- **`PaymentMethodInfo`** — interface with `id` and optional `holdHours`.
- **`validateBankTransferConfig(): string[]`** — boot-time IBAN/BIC validation via `ibantools`; returns offending variable names.
- **`paymentWebhookSecrets(): string[]`** — splits the comma-separated `NODE_PAYMENT_WEBHOOK_SECRET` into a signed-ring (first signs, any verifies).
- **`paymentEffectRetryMinutes` / `paymentReconcileMinutes` / `paymentAttentionMinutes` / `abandonedPaymentRetentionDays`** — per-call accessors for the four grace/retention windows consumed by the effects sweeps and the payments page.
- **`TRANSFER_PAYMENT_RETENTION_DAYS`** — constant (365); how long a cancelled bank-transfer is kept for late-reference matching.
- **`webhookSecretRing`** (private) — splits the raw env value into trimmed entries, preserving empty slots so they fail the length check.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the function that wraps the shape + check into a validated config reader.
- **`src/infrastructure/config/fields.ts`** — provides the `text`, `int`, and `secret` field-builder helpers used to declare each variable's type, default, and constraints.
- **`src/modules/payments/controllers/get-payment-methods.ts`** — calls `listPaymentMethods()` to build the HTTP response; defers to `bankTransferEnabled()` rather than re-deriving the check.
- **`src/modules/cart/services/checkout.ts`** — reads `bankTransferEnabled()` and `listPaymentMethods()` to gate whether a method is selectable at checkout.
- **`src/modules/payments/presenter.ts`** — reads `bankTransferBeneficiary`, `bankTransferIbanFriendly`, and `bankTransferBic` to render the `nextAction` shown to the buyer.
- **`src/modules/payments/providers/webhook-signature.ts`** — reads `paymentWebhookSecrets()` to obtain the ring it verifies incoming signatures against.
- **`src/modules/payments/services/effects.ts`** — reads `paymentEffectRetryMinutes`, `paymentReconcileMinutes`, and `abandonedPaymentRetentionDays` to time its sweep ticks.
- **`src/modules/payments/services/deadline.ts`** — reads `bankTransferHoldHours` to compute the reservation deadline for a `bank_transfer` order.
- **`src/modules/payments/providers/index.ts`** — the provider resolver; it imports this file (hence the provider-probe logic lives there, not here, to avoid a circular import).
- **`src/modules/payments/module.ts`** — wires the config into the module's DI / export surface.
- **`src/modules/payments/services/refunds.ts` / `refund-settlement.ts`** — consume the retry and reconcile windows for refund state transitions.

## Notes

- **Per-call read, not import-time cache.** Every accessor calls `paymentsConfig()` inside its body. This lets tests swap values between calls and prevents a second reader from hard-coding its own fallback.
- **IBAN is stored verbatim** (spaces and case as the operator typed it). Only `bankTransferIbanFriendly` normalises for display; the boot check uses `ibantools.electronicFormatIBAN` to strip spaces before validating.
- **`NODE_PAYMENT_PROVIDER` has no default.** Unset ⇒ card payments are off. `NODE_PAYMENT_WEBHOOK_SECRET` is therefore optional (`minLength: 0`), but any *set* value must have every comma-separated entry ≥ 16 characters.
- **Trailing-comma guard.** `webhookSecretRing` deliberately keeps empty entries after split, so a stray trailing comma fails the length check instead of silently shrinking the ring.
- **`TRANSFER_PAYMENT_RETENTION_DAYS` is a constant**, not an env variable. It is intentionally longer (1 year) than `abandonedPaymentRetentionDays` so a late bank transfer can still be matched by reference.
- **Provider probe lives in `./providers`.** Because the resolver imports this file, the provider's own liveness check cannot be placed here without creating a circular dependency.
