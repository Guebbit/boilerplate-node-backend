---
source: src/modules/payments/config.ts
sha256: f3bc2a8e4dc6d1af2749eecb074e1f1602df068504e181357cb30d8c413c23ed
generated_at: 2026-09-27T15:23:08.278752+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/config.ts

## Purpose

Centralizes the payment-specific configuration values that this module exclusively owns (method listing, effect-sweep grace window, Stripe key gate, bank-transfer validation). Values are read per call rather than captured at import time so that a config change takes effect on the next invocation without a restart, and so no consumer transcribes its own copy of a fallback.

## Key elements

- **`PaymentMethodInfo`** — interface describing one offerable payment method (`card` or `bank_transfer`), with an optional `holdHours` field only present for bank transfers.
- **`listPaymentMethods()`** — returns the ordered array of methods this deployment offers; includes `bank_transfer` only when `bankTransferEnabled()` is true. Shared single source for both the `GET /payments/methods` endpoint and checkout so they cannot drift.
- **`validateBankTransferConfig()`** — boot-time check (registered as the module's `customCheck`) that validates IBAN via `ibantools.isValidIBAN` and BIC via `isValidBIC`; strips spaces with `electronicFormatIBAN` before checking. Returns an array of offending env-var names.
- **`paymentEffectRetryMinutes()`** — grace window (minutes) before `effects.ts#retryPendingEffects` will act on a `pendingEffects` marker; read via `environmentNumber` so tests can vary it per case.
- **`validateStripeSecretKey()`** — production-only boot gate that refuses to start if `NODE_STRIPE_SECRET_KEY` begins with `sk_test_`. Dormant in non-production environments.

## Relationships

- **`@infrastructure/runtime/environment`** — provides `environmentNumber`, used by `paymentEffectRetryMinutes` to read `NODE_PAYMENT_EFFECT_RETRY_MINUTES` with a default of `1` and a minimum of `0`.
- **`@modules/orders` (index / config)** — source of `bankTransferBeneficiary`, `bankTransferBic`, `bankTransferEnabled`, `bankTransferHoldHours`, `bankTransferIban`. This file consumes those values for validation and method listing but does not own the underlying bank-transfer business rule.
- **`src/modules/payments/module.ts`** — registers `validateBankTransferConfig` and `validateStripeSecretKey` as the module's `customCheck` boot gates.
- **`src/modules/payments/controllers/get-payment-methods.ts`** — calls `listPaymentMethods()` to build its response.
- **`src/modules/payments/services/effects.ts`** — reads `paymentEffectRetryMinutes()` on each sweep tick to decide whether a `pendingEffects` marker is old enough to retry.
- **`src/modules/cart/services/checkout.ts`** — calls `listPaymentMethods()` so the checkout flow offers the same methods the public endpoint reports.
- **`src/modules/payments/tests/unit/config.test.ts`** — unit-tests every exported function.

## Notes

- Bank-transfer *values* (beneficiary, IBAN, BIC, hold-hours, enabled flag) live in `@modules/orders/config.ts`, not here. This file only validates them and exposes them as a method-list entry. If you change a bank-transfer default, edit the `orders` config, not this file.
- `validateBankTransferConfig` is intentionally permissive: an empty IBAN means "bank transfer unconfigured" and produces no error. Only *present-but-invalid* values are flagged.
- `validateStripeSecretKey` checks `process.env.NODE_STRIPE_SECRET_KEY` directly (not via `environmentNumber`/`environment.ts`) because it only needs a prefix check, not a typed numeric read.
- `paymentEffectRetryMinutes` uses a minimum of `0` (not `1`), meaning a deployment can set it to `0` to allow immediate retry — useful in tests.
