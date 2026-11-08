---
source: src/modules/payments/config.ts
sha256: 1908cbba3c2d568cbc2a0fdb18506ee07ea787ced6fec1f5eeab1be7b56c8615
generated_at: 2026-11-08T07:16:46.945413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/config.ts

## Purpose

Centralised, per-call configuration for the payments module. Declares every deployment-tuned value related to money — bank-transfer account details, the set of offered payment methods, webhook signing secrets, and the grace windows that drive background effect sweeps — in a single `defineConfig` instance so no other file transcribes its own fallback copy.

## Key elements

- **`paymentsConfig`** — the `defineConfig` instance; defines the env-var shape, defaults, and the boot-time `check` (webhook ring length + bank-transfer validation).
- **`bankTransferBeneficiary` / `bankTransferIban` / `bankTransferBic` / `bankTransferHoldHours`** — individual getters; return `undefined` when unset.
- **`bankTransferIbanFriendly`** — strips all whitespace and re-groups the IBAN into 4-char blocks for display.
- **`bankTransferEnabled`** — `true` only when both beneficiary and IBAN are set; the single gate both the controller and checkout defer to.
- **`PaymentMethodInfo`** (interface) — `{ id, holdHours? }` entry shape.
- **`listPaymentMethods`** — returns the ordered array of methods the deployment offers (card if a provider is set, bank-transfer if enabled, with its `holdHours`).
- **`validateBankTransferConfig`** — boot-time check: requires beneficiary when IBAN is set, validates IBAN (mod-97 via `ibantools`) and BIC (ISO 9362 shape); returns the offending var names.
- **`webhookSecretRing`** (module-private) — splits `NODE_PAYMENT_WEBHOOK_SECRET` on commas, trims entries, keeps empty entries so they fail the length check.
- **`paymentWebhookSecrets`** — returns the full ring (newest first) or `[]` when unset.
- **`paymentEffectRetryMinutes`** — grace before `effects.ts#retryOpenRefunds` retries an in-flight refund (default 1 min).
- **`paymentReconcileMinutes`** — grace before `effects.ts#reconcileStalePayments` queries the provider (default 15 min).
- **`paymentAttentionMinutes`** — threshold for flagging a refund as "needs attention" on the UI (default 60 min).
- **`abandonedPaymentRetentionDays`** — retention for generic abandoned attempts (default 30 d).
- **`TRANSFER_PAYMENT_RETENTION_DAYS`** — compile-time constant (365); longer retention for *canceled* bank-transfer payments so a late wire can still be matched.

## Relationships

- **`@infrastructure/config/define`** (`define.ts`) — provides the `defineConfig` factory used to build `paymentsConfig`.
- **`@infrastructure/config/fields`** (`fields.ts`) — supplies the `text`, `int`, `secret` field descriptors for the shape.
- **`@modules/payments/controllers/get-payment-methods.ts`** — calls `listPaymentMethods` to build the `GET /payments/methods` response.
- **`@modules/cart/services/checkout.ts`** — reads `bankTransferEnabled` / `listPaymentMethods` to decide whether to offer a method at checkout.
- **`@modules/payments/presenter.ts`** — reads `bankTransferIbanFriendly`, `bankTransferBeneficiary`, `bankTransferBic` to render the `nextAction` shown to the buyer.
- **`@modules/payments/providers/webhook-signature.ts`** — calls `paymentWebhookSecrets` to obtain the verification ring.
- **`@modules/payments/providers/index.ts`** — the provider resolver imports this file (so it cannot in turn probe `NODE_PAYMENT_PROVIDER` from here); reads `paymentsConfig().NODE_PAYMENT_PROVIDER` to select the active provider.
- **`@modules/payments/services/effects.ts`** — reads `paymentEffectRetryMinutes`, `paymentReconcileMinutes`, `paymentAttentionMinutes` to gate its sweep ticks.
- **`@modules/payments/services/retention.ts`** — reads `abandonedPaymentRetentionDays` and `TRANSFER_PAYMENT_RETENTION_DAYS` to decide what to reap.
- **`@modules/payments/services/refunds.ts` / `refund-settlement.ts`** — read the retry/reconcile grace windows.
- **`@modules/payments/module.ts`** — boots the module; the `check` callback in `paymentsConfig` runs at this stage, failing fast on misconfiguration.

## Notes

- All getters call `paymentsConfig()` at invocation time (no module-level cache), matching the convention used in `@modules/inventory/config.ts`, so tests can vary values per case.
- `NODE_PAYMENT_WEBHOOK_SECRET` has `minLength: 0` in the field definition (it may be entirely unset when no card provider is configured), but the boot `check` enforces a **per-entry** floor of 16 characters on every ring member. Empty entries from a trailing comma are deliberately kept so they trip that check rather than silently shrinking the ring.
- `bankTransferIban` returns the raw configured string (spaces and all); only `bankTransferIbanFriendly` normalises for display. Boot validation separately strips spaces via `electronicFormatIBAN` before the mod-97 check.
- `NODE_PAYMENT_PROVIDER` has **no default** — unset means card payments are silently off; this is by design, not an error.
- `TRANSFER_PAYMENT_RETENTION_DAYS` is a hard-coded constant, not env-configurable, because the 1-year window is a legal/compliance floor rather than a tunable.
