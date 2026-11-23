---
source: src/modules/payments/config.ts
source_sha256: 7c403ab5f76a1e94c74c682bf3050ad856f7b7302621ed8a25ff2496d5a072df
context_sha256: 0551283aa2ce24c4b260eabd75f893b41997a0f90dca4ae3428ce7050b482ae9
generated_at: 2026-11-22T06:40:56.114459+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/config.ts

## Purpose
Single place where a deployment's payment settings are declared, validated at boot, and read. It covers the bank-transfer method (beneficiary, IBAN, BIC, hold window), the list of payment methods on offer, the webhook signing-secret ring, and the grace/retention windows used by the payment sweeps. Values are read per call (getters over `paymentsConfig()`), so tests can vary them and no second reader needs its own copy of a fallback. This follows the same arrangement as `@modules/inventory`'s `config.ts`.

## Key elements
- **`paymentsConfig`**: the `defineConfig` declaration (`name: 'payments'`). Its shape covers:
  - `NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN` and `NODE_BANK_TRANSFER_BIC` (text).
  - `NODE_BANK_TRANSFER_HOLD_HOURS` (int, default 168, min 1).
  - `NODE_PAYMENT_PROVIDER` (lower-cased text, no default).
  - `NODE_PAYMENT_WEBHOOK_SECRET` (secret, `productionOnly`, `minLength: 0`).
  - `NODE_PAYMENT_REFUND_RETRY_MINUTES` (default 1, min 0).
  - `NODE_PAYMENT_RECONCILE_MINUTES` (default 15, min 0).
  - `NODE_PAYMENT_ATTENTION_MINUTES` (default 60, min 1).
  - `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (default 30, min 1).
  - Its `check` fails boot if any webhook-secret ring entry is shorter than 16 characters, and also reports the problems from `validateBankTransferConfig`.
- **Bank-transfer getters**:
  - `bankTransferBeneficiary`, `bankTransferIban`, `bankTransferBic` and `bankTransferHoldHours` return the raw configured values.
  - `bankTransferIbanFriendly` returns the IBAN in 4-character groups.
  - `bankTransferEnabled` is true only when both beneficiary and IBAN are set.
- **`validateBankTransferConfig()`**: returns the names of the offending variables. It flags an IBAN set without a beneficiary, an IBAN that fails `isValidIBAN` after `electronicFormatIBAN`, and a BIC that fails `isValidBIC`.
- **`listPaymentMethods()`**: returns `PaymentMethodInfo[]` (`id: PaymentMethodId`, optional `holdHours`). It includes `card` when `NODE_PAYMENT_PROVIDER` is set, and `bank_transfer` (with `holdHours`) when bank transfer is enabled. The list is empty if neither applies, which turns checkout off.
- **`paymentWebhookSecrets()`**: returns the comma-separated secret ring, newest first, or `[]` when unset. The first entry signs and any entry verifies.
- **Sweep and retention getters**:
  - `paymentEffectRetryMinutes`: the grace window before `effects.ts#retryOpenRefunds` finishes an open refund.
  - `paymentReconcileMinutes`: the grace window before `effects.ts#reconcileStalePayments` asks the provider about an unsettled payment.
  - `paymentAttentionMinutes`: how long a refund stays open before it is listed under "needs attention".
  - `abandonedPaymentRetentionDays`: how long an abandoned attempt is kept before `reapAbandonedPayments` deletes it.
- **`TRANSFER_PAYMENT_RETENTION_DAYS`**: constant, 365. Unpaid or canceled bank-transfer payments are kept this long so a late transfer can still be matched by its reference.

## Relationships
- **`src/infrastructure/config/define.ts` and `src/infrastructure/config/fields.ts`**: supply `defineConfig` and the `int`, `secret` and `text` field builders used to declare `paymentsConfig`.
- **`ibantools`** (external): used for IBAN and BIC validation.
- **`@types`**: provides `PaymentMethodId`.
- **`src/modules/payments/providers/index.ts`**: probes `NODE_PAYMENT_PROVIDER`. That probe lives there because the provider resolver imports this file. `src/modules/payments/providers/webhook-signature.ts` presumably consumes the secret ring.
- **Sweep and retention consumers**: `src/modules/payments/services/effects.ts` is named as the reader of the retry and reconcile windows. `src/modules/payments/services/retention.ts` is the likely reader of the retention constants.
- **Neighbors that likely read these getters**: `src/modules/payments/controllers/get-payment-methods.ts` and `src/modules/payments/services/list.ts` (method list), `src/modules/cart/services/checkout.ts` (checkout refuses `bank_transfer` when it is disabled and uses the hold window), and `src/modules/payments/presenter.ts` (shows the beneficiary and IBAN as `nextAction`).

## Notes
- `NODE_PAYMENT_WEBHOOK_SECRET` is not required: with no provider, nothing needs signing. When set, every comma-separated entry must be at least 16 characters. Empty entries, such as from a trailing comma, are kept so they fail the check rather than silently shrinking the ring.
- To rotate a secret, put the new one first and keep the old one after it. Drop the old one once the provider signs with the new.
- `bankTransferIban` returns the value as typed, spaces included. Normalisation happens only in the boot check.
- `bankTransferIbanFriendly` strips whitespace and groups into 4 characters, but does not upper-case.
- The BIC is optional. `isValidBIC` checks only the ISO 9362 shape, with no registry lookup.
- The boot check exists so a bad value fails at startup, rather than on the first `GET /payments/methods` call or by silently advertising an unusable account.
