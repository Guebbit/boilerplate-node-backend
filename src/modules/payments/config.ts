/**
 * @module
 * The values a deployment tunes about money, read in one place — same arrangement as
 * `@modules/inventory`'s `config.ts`: read per call so a test can vary it, and so a second reader doesn't transcribe its own copy of the fallback.
 *
 * The bank-transfer method is this module's: its beneficiary, IBAN, BIC and hold window are
 * declared here, validated with `ibantools` at boot, and shown to the buyer on the payment itself
 * (`nextAction`). This file also lists the methods `GET /payments/methods` answers and holds the
 * payment-effect sweep's own grace window.
 */

import { electronicFormatIBAN, isValidBIC, isValidIBAN } from 'ibantools';
import { defineConfig } from '@infrastructure/config/define';
import { int, secret, text } from '@infrastructure/config/fields';

/**
 * The account name a transfer should be made out to. Unset means transfer is not offered at all.
 * @returns the configured beneficiary, or `undefined`
 */
export const bankTransferBeneficiary = (): string | undefined =>
    paymentsConfig().NODE_BANK_TRANSFER_BENEFICIARY;

/**
 * The account IBAN, exactly as configured — whatever shape it was typed in, spaces included.
 * The boot check runs it through `ibantools`' own `electronicFormatIBAN` before validating, so this
 * getter does no normalising of its own.
 * @returns the configured IBAN, or `undefined`
 */
export const bankTransferIban = (): string | undefined => paymentsConfig().NODE_BANK_TRANSFER_IBAN;

/**
 * The IBAN grouped into 4-character blocks, the way a bank's own transfer form shows one — what
 * the customer actually copies.
 * @returns the grouped IBAN, or `undefined` when none is configured
 */
export const bankTransferIbanFriendly = (): string | undefined => {
    const iban = bankTransferIban();
    return iban
        ?.replaceAll(/\s+/g, '')
        .replaceAll(/(.{4})/g, '$1 ')
        .trim();
};

/**
 * The account's BIC/SWIFT code — optional even once transfer is offered, since a domestic IBAN
 * is often enough on its own.
 * @returns the configured BIC, or `undefined`
 */
export const bankTransferBic = (): string | undefined => paymentsConfig().NODE_BANK_TRANSFER_BIC;

/**
 * How long checkout holds stock for a `bank_transfer` order before the reservation sweep
 * releases it — a week by default, since a transfer is not a same-day action the way a card is.
 * @returns the hold window, in hours
 */
export const bankTransferHoldHours = (): number => paymentsConfig().NODE_BANK_TRANSFER_HOLD_HOURS;

/**
 * Whether this deployment offers `bank_transfer` at all — both the beneficiary and the IBAN must
 * be set. `GET /payments/methods` reads this; checkout refuses the method when it is `false`.
 * @returns `true` once both are configured
 */
export const bankTransferEnabled = (): boolean =>
    Boolean(bankTransferBeneficiary() && bankTransferIban());

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

/** Shortest webhook signing secret a deployment may set, per ring entry. */
const WEBHOOK_SECRET_MIN_LENGTH = 16;

/**
 * Split `NODE_PAYMENT_WEBHOOK_SECRET` into its ring: comma-separated, entries trimmed. A rotation
 * is the operator putting the new secret first and the old one after it, then dropping the old one
 * once the provider signs with the new — an env list the operator edits, not a stored one that
 * expires. Empty entries (a trailing comma) are kept, so they fail the length check instead of
 * silently shrinking the ring.
 * @param value - the variable's value
 * @returns every entry, in order; the first is the one that signs
 */
const webhookSecretRing = (value: string): string[] =>
    value.split(',').map((entry) => entry.trim());

/**
 * What a deployment tunes about payments, and what refuses boot.
 *
 * `NODE_PAYMENT_PROVIDER` has no default: unset means no card provider, so card payments are off.
 * `NODE_PAYMENT_WEBHOOK_SECRET` is therefore not required either — with no provider there is
 * nothing to sign; the provider that is named reads it when it verifies a delivery.
 * `NODE_PAYMENT_PROVIDER`'s own probe lives in `./providers` (the resolver imports this file, so it
 * cannot be probed from here).
 */
export const paymentsConfig = defineConfig({
    name: 'payments',
    shape: {
        NODE_BANK_TRANSFER_BENEFICIARY: text(),
        NODE_BANK_TRANSFER_IBAN: text(),
        NODE_BANK_TRANSFER_BIC: text(),
        NODE_BANK_TRANSFER_HOLD_HOURS: int({ default: 168, min: 1 }),
        NODE_PAYMENT_PROVIDER: text({ case: 'lower' }),
        NODE_PAYMENT_WEBHOOK_SECRET: secret({
            // `0`: may stay unset (no provider, nothing to sign). Never the `.env-example`
            // placeholder in a deployment; the 16-character floor of a SET value is `check` below.
            minLength: 0,
            placeholder: 'your-payment-webhook-secret-here',
            productionOnly: true
        }),
        NODE_PAYMENT_EFFECT_RETRY_MINUTES: int({ default: 1, min: 0 }),
        NODE_PAYMENT_RECONCILE_MINUTES: int({ default: 15, min: 0 }),
        NODE_PAYMENT_ATTENTION_MINUTES: int({ default: 60, min: 1 }),
        NODE_PAYMENT_ABANDONED_RETENTION_DAYS: int({ default: 30, min: 1 })
    },
    check: (config) => [
        ...(config.NODE_PAYMENT_WEBHOOK_SECRET !== undefined &&
        webhookSecretRing(config.NODE_PAYMENT_WEBHOOK_SECRET).some(
            (entry) => entry.length < WEBHOOK_SECRET_MIN_LENGTH
        )
            ? ['NODE_PAYMENT_WEBHOOK_SECRET']
            : []),
        ...validateBankTransferConfig()
    ]
});

/**
 * How long an open refund sits untouched before `effects.ts#retryOpenRefunds` finishes it. A refund
 * whose request is still in flight must never be raced by the sweep that exists only for the
 * crash case — this is that buffer. Read per call, like `@modules/inventory`'s own config, so a
 * change applies to the next sweep tick and a test can vary it per case.
 * @returns the grace window in minutes
 */
export const paymentEffectRetryMinutes = (): number =>
    paymentsConfig().NODE_PAYMENT_EFFECT_RETRY_MINUTES;

/**
 * How long an unsettled payment sits untouched before `effects.ts#reconcileStalePayments` asks
 * the provider what became of it. Longer than a normal confirm-then-webhook round trip, so the
 * sweep does not spend a provider call on a customer still typing a card number. Read per call,
 * like {@link paymentEffectRetryMinutes}.
 * @returns the grace window in minutes
 */
export const paymentReconcileMinutes = (): number =>
    paymentsConfig().NODE_PAYMENT_RECONCILE_MINUTES;

/**
 * How long a refund may stay open before the payments page lists it under "needs attention". The
 * retry window is a minute, which is useless as "stuck": this is how long a person would wait.
 * Read per call, like {@link paymentReconcileMinutes}.
 * @returns the threshold in minutes
 */
export const paymentAttentionMinutes = (): number =>
    paymentsConfig().NODE_PAYMENT_ATTENTION_MINUTES;

/**
 * Days an abandoned payment attempt is kept before `reapAbandonedPayments` deletes it.
 * @returns the retention, in days
 */
export const abandonedPaymentRetentionDays = (): number =>
    paymentsConfig().NODE_PAYMENT_ABANDONED_RETENTION_DAYS;

/**
 * The provider's signing secrets, empty when unset: the first signs, any of them verifies.
 * @returns the configured webhook secret ring, newest first
 */
export const paymentWebhookSecrets = (): string[] => {
    const value = paymentsConfig().NODE_PAYMENT_WEBHOOK_SECRET;
    return value === undefined ? [] : webhookSecretRing(value);
};

/**
 * Days a bank-transfer payment is kept once it was cancelled, so a late transfer can still be
 * found by its reference and recorded. A year: banks and buyers are slow, and a reference that
 * stops matching would leave money with no order. Every other abandoned attempt goes after
 * {@link abandonedPaymentRetentionDays}.
 */
export const TRANSFER_PAYMENT_RETENTION_DAYS = 365;
