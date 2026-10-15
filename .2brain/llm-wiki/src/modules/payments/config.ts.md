---
source: src/modules/payments/config.ts
sha256: ecbd00c642047e0b3f278984362b9a08d9a857d29fca16e7544cbcdd7bc4c4ed
generated_at: 2026-10-15T11:22:53.964017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/config.ts

## Purpose

Central read-point for every deployment-tuned value the payments module owns: which methods are offered, the payment-effect sweep grace windows, abandoned-payment retention, and the webhook secret ring. Bank-transfer *values* (beneficiary, IBAN, BIC, hold hours) belong to `@modules/orders`; this file only validates them at boot. All getters read the config per call (never cache) so tests can vary values and no second module transcribes its own fallback.

## Key elements

- **`PaymentMethodInfo`** — interface for one entry in the methods list (`id: 'card' | 'bank_transfer'`, optional `holdHours`).
- **`listPaymentMethods()`** — returns the methods a deployment offers, in presentation order. Card appears only if `NODE_PAYMENT_PROVIDER` is set; bank transfer only if `bankTransferEnabled()` (from orders) is true. Empty list ⇒ checkout is off.
- **`validateBankTransferConfig()`** — boot-time check that returns offending env-var names. Uses `ibantools` to validate IBAN (after `electronicFormatIBAN` strips spaces) and BIC shape; also flags a missing beneficiary when IBAN is set.
- **`paymentsConfig`** — the `defineConfig` object declaring all `NODE_PAYMENT_*` fields and the `check` function (webhook-secret ring length + bank-transfer validation).
- **`paymentEffectRetryMinutes()`** — grace window before `retryOpenRefunds` finishes an in-flight refund.
- **`paymentReconcileMinutes()`** — grace window before `reconcileStalePayments` asks the provider for status.
- **`paymentAttentionMinutes()`** — threshold before a refund is listed under "needs attention" on the payments page.
- **`abandonedPaymentRetentionDays()`** — days before `reapAbandonedPayments` deletes an abandoned attempt.
- **`paymentWebhookSecrets()`** — splits `NODE_PAYMENT_WEBHOOK_SECRET` into its comma-separated ring (first entry signs, any entry verifies). Returns `[]` when unset.

## Relationships

- **`@infrastructure/config/define` / `fields`** — provides `defineConfig`, `int`, `secret`, `text` used to declare the shape and check.
- **`@modules/orders` (config)** — imports `bankTransferBeneficiary`, `bankTransferIban`, `bankTransferBic`, `bankTransferEnabled`, `bankTransferHoldHours` for validation and the methods list.
- **`./controllers/get-payment-methods`** and **`./services/list`** — consume `listPaymentMethods()`.
- **`./module.ts`** — the resolver that probes `NODE_PAYMENT_PROVIDER` (cannot live here to avoid a circular import).
- **`./providers/webhook-signature`** / **`./providers/index`** — read `paymentWebhookSecrets()` to verify signed deliveries.
- **`./services/effects`** — reads the three grace-window getters to schedule sweeps.
- **`./services/retention`** — reads `abandonedPaymentRetentionDays()`.
- **`./tests/unit/config.test.ts`** — unit-tests the validation and ring-parsing logic.

## Notes

- **Ownership boundary:** bank-transfer business values live in `orders/config.ts`; this file only *validates* them and *surfaces* them in the methods list. Do not duplicate them here.
- **Per-call reads:** every getter calls `paymentsConfig()` (or the orders getters) at invocation time. There is no module-level cached snapshot.
- **Webhook secret ring:** entries are comma-separated and trimmed; a trailing comma produces an empty entry that *stays* in the array so the 16-char floor check catches it. The first entry is the signing key; all entries are accepted for verification (rotation = put new first, drop old later).
- **`NODE_PAYMENT_PROVIDER` probe:** intentionally absent from this file's `check`; `module.ts` resolves it because importing the resolver here would be circular.
- **`NODE_PAYMENT_WEBHOOK_SECRET` `minLength: 0`:** the field may legitimately be unset (no card provider). The 16-character floor is enforced in `check` only when the value *is* set.
