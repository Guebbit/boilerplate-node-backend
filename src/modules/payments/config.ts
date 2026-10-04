/**
 * @module
 * The values a deployment tunes about money, read in one place — same arrangement as
 * `@modules/inventory`'s `config.ts`: read per call so a test can vary it, and so a second reader doesn't transcribe its own copy of the fallback.
 *
 * The bank-transfer VALUES themselves (`bankTransferBeneficiary`/`Iban`/`Bic`) and `shopCurrency`
 * are `@modules/orders`' own config — `orders` renders `transferInstructions` and enforces the
 * open-transfer cap, so it owns the bank-transfer business rule, and it already owns the shop's
 * one currency for the invoice this module's payments settle; this module already depends on
 * `orders` for `markPaid`. This file owns what IS this module's alone: validating the configured
 * bank-transfer values with `ibantools` at boot, listing the methods `GET /payments/methods`
 * answers, the payment-effect sweep's own grace window, and the Stripe test-key boot gate.
 */

import { electronicFormatIBAN, isValidBIC, isValidIBAN } from 'ibantools';
import { defineConfig, isRelaxedIn } from '@infrastructure/config/define';
import { int, secret, text } from '@infrastructure/config/fields';
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban
} from '@modules/orders';

/**
 * One payment method `GET /payments/methods` and checkout may offer.
 */
export interface PaymentMethodInfo {
    id: 'card' | 'bank_transfer';
    /** Only present for `bank_transfer` — see `bankTransferHoldHours`'s own docblock. */
    holdHours?: number;
}

/**
 * Which methods this deployment offers. `card` only once a provider is configured
 * (`NODE_PAYMENT_PROVIDER`); `bank_transfer` only once its beneficiary and IBAN are both
 * configured — the check `GET /payments/methods` and checkout both defer to, so neither can drift
 * from the other. With neither, the list is empty and checkout is off.
 * @returns the offered methods, in the order a client should present them
 */
export const listPaymentMethods = (): PaymentMethodInfo[] => [
    ...(paymentsConfig().NODE_PAYMENT_PROVIDER === undefined ? [] : [{ id: 'card' as const }]),
    ...(bankTransferEnabled()
        ? [{ id: 'bank_transfer' as const, holdHours: bankTransferHoldHours() }]
        : [])
];

/**
 * The boot-time gate on `NODE_BANK_TRANSFER_*`, run as {@link paymentsConfig}'s check.
 * `ibantools` — https://github.com/Simplify/ibantools — validates the IBAN and, when set, the
 * BIC; `electronicFormatIBAN` strips spaces before either check runs, since a deployment is as
 * likely to paste one with them as without. A misconfigured value would otherwise only throw on
 * the first `GET /payments/methods` call, or worse, silently advertise a beneficiary with no
 * valid account behind it.
 * @returns the offending variable names; empty when nothing is wrong or transfer is unconfigured
 */
export const validateBankTransferConfig = (): string[] => {
    const beneficiary = bankTransferBeneficiary();
    const iban = bankTransferIban();
    const bic = bankTransferBic();

    const problems: string[] = [];
    if (iban && !beneficiary) problems.push('NODE_BANK_TRANSFER_BENEFICIARY');
    // ibantools: `electronicFormatIBAN` strips spaces and upper-cases (`null` if not IBAN-shaped);
    // `isValidIBAN` checks country length and the mod-97 checksum. https://github.com/Simplify/ibantools
    if (iban && !isValidIBAN(electronicFormatIBAN(iban) ?? iban))
        problems.push('NODE_BANK_TRANSFER_IBAN');
    // ibantools `isValidBIC`: ISO 9362 shape (8 or 11 characters), no registry lookup.
    if (bic && !isValidBIC(bic)) problems.push('NODE_BANK_TRANSFER_BIC');
    return problems;
};

/** Shortest webhook signing secret a deployment may set. */
const WEBHOOK_SECRET_MIN_LENGTH = 16;

/**
 * What a deployment tunes about payments, and what refuses boot.
 *
 * `NODE_PAYMENT_PROVIDER` has no default: unset means no card provider, so card payments are off.
 * `NODE_PAYMENT_WEBHOOK_SECRET` is therefore not required either — with no provider there is
 * nothing to sign; the provider that is named reads it when it verifies a delivery.
 * `NODE_PAYMENT_PROVIDER`'s own probe lives in `./module` (the resolver imports this file, so it
 * cannot be probed from here).
 */
export const paymentsConfig = defineConfig({
    name: 'payments',
    shape: {
        NODE_PAYMENT_PROVIDER: text({
            lower: true,
            describe:
                'The card payment provider a deployment registers. Unset: no card payments, and checkout offers only the other methods.'
        }),
        NODE_PAYMENT_WEBHOOK_SECRET: secret({
            // `0`: may stay unset (no provider, nothing to sign). Never the `.env-example`
            // placeholder in a deployment; the 16-character floor of a SET value is `check` below.
            minLength: 0,
            placeholder: 'your-payment-webhook-secret-here',
            productionOnly: true,
            describe:
                'The secret the provider signs webhook deliveries with. Unset when no provider is configured; 16+ characters once set.'
        }),
        NODE_STRIPE_SECRET_KEY: text({
            sensitive: true,
            describe: 'Stripe secret key. A test-mode key refuses boot outside development/test.'
        }),
        NODE_PAYMENT_EFFECT_RETRY_MINUTES: int({
            default: 1,
            min: 0,
            describe: 'Age a `pendingEffects` marker must reach before the sweep acts on it.'
        }),
        NODE_PAYMENT_ABANDONED_RETENTION_DAYS: int({
            default: 30,
            min: 1,
            describe: 'Days an abandoned payment attempt is kept before the sweep deletes it.'
        })
    },
    check: (config, environment) => [
        ...(config.NODE_PAYMENT_WEBHOOK_SECRET !== undefined &&
        config.NODE_PAYMENT_WEBHOOK_SECRET.length < WEBHOOK_SECRET_MIN_LENGTH
            ? ['NODE_PAYMENT_WEBHOOK_SECRET']
            : []),
        ...validateBankTransferConfig(),
        ...validateStripeSecretKey(config.NODE_STRIPE_SECRET_KEY, environment)
    ]
});

/**
 * How old a `pendingEffects` marker must be before `effects.ts#retryPendingEffects` will act on
 * it. A settlement still between setting the marker and clearing it must never be raced by the
 * sweep that exists only for the crash case — this is that buffer. Read per call, like
 * `@modules/inventory`'s own config, so a change applies to the next sweep tick and a test can
 * vary it per case. Same naming pattern as `orders`' own `orderEffectRetryMinutes`.
 * @returns the grace window in minutes
 */
export const paymentEffectRetryMinutes = (): number =>
    paymentsConfig().NODE_PAYMENT_EFFECT_RETRY_MINUTES;

/**
 * Days an abandoned payment attempt is kept before `reapAbandonedPayments` deletes it.
 * @returns the retention, in days
 */
export const abandonedPaymentRetentionDays = (): number =>
    paymentsConfig().NODE_PAYMENT_ABANDONED_RETENTION_DAYS;

/**
 * The provider's signing secret, `undefined` when unset.
 * @returns the configured webhook secret
 */
export const paymentWebhookSecret = (): string | undefined =>
    paymentsConfig().NODE_PAYMENT_WEBHOOK_SECRET;

/**
 * Refuse to boot on a deployment (any `NODE_ENV` but development/test) with a Stripe TEST-mode key. `sk_test_` is Stripe's own prefix
 * for one — https://docs.stripe.com/keys#test-live-modes — and a deployment that pastes one into
 * production would silently run every "real" payment through Stripe's test ledger: orders marked
 * paid, and no money ever actually moving. Checked outside development/test only; a test key is
 * exactly right there, `NODE_STRIPE_SECRET_KEY` unset included — there is no shipped
 * Stripe implementation yet, so this stays dormant until a deployment sets one.
 * @param key - the configured secret key, if any
 * @param environment - judged for development/test
 * @returns `['NODE_STRIPE_SECRET_KEY']` when a deployment boot is configured with a test-mode
 *   Stripe key; empty otherwise
 */
export const validateStripeSecretKey = (
    key: string | undefined,
    environment: Readonly<Record<string, string | undefined>>
): string[] =>
    !isRelaxedIn(environment) && key?.startsWith('sk_test_') ? ['NODE_STRIPE_SECRET_KEY'] : [];
