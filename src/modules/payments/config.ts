/**
 * @module
 * The values a deployment tunes about money, read in one place — same arrangement as
 * `@modules/inventory`'s `config.ts`: read per call so a change takes effect on the next intent,
 * not the next restart, and so a second reader doesn't transcribe its own copy of the fallback.
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
import { environmentNumber, isRelaxedEnvironment } from '@infrastructure/runtime/environment';
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
 * Which methods this deployment offers. `card` always; `bank_transfer` only once its beneficiary
 * and IBAN are both configured — the check `GET /payments/methods` and checkout both defer to,
 * so neither can drift from the other.
 * @returns the offered methods, in the order a client should present them
 */
export const listPaymentMethods = (): PaymentMethodInfo[] => [
    { id: 'card' },
    ...(bankTransferEnabled()
        ? [{ id: 'bank_transfer' as const, holdHours: bankTransferHoldHours() }]
        : [])
];

/**
 * The boot-time gate on `NODE_BANK_TRANSFER_*`, registered as this module's `customCheck`.
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
    if (iban && !isValidIBAN(electronicFormatIBAN(iban) ?? iban))
        problems.push('NODE_BANK_TRANSFER_IBAN');
    if (bic && !isValidBIC(bic)) problems.push('NODE_BANK_TRANSFER_BIC');
    return problems;
};

/**
 * How old a `pendingEffects` marker must be before `effects.ts#retryPendingEffects` will act on
 * it. A settlement still between setting the marker and clearing it must never be raced by the
 * sweep that exists only for the crash case — this is that buffer. Read per call, like
 * `@modules/inventory`'s own config, so a change applies to the next sweep tick and a test can
 * vary it per case. Same naming pattern as `orders`' own `orderEffectRetryMinutes`.
 * @returns the grace window in minutes
 */
export const paymentEffectRetryMinutes = (): number =>
    environmentNumber('NODE_PAYMENT_EFFECT_RETRY_MINUTES', 1, 0);

/**
 * Refuse to boot on a deployment (any `NODE_ENV` but development/test) with a Stripe TEST-mode key. `sk_test_` is Stripe's own prefix
 * for one — https://docs.stripe.com/keys#test-live-modes — and a deployment that pastes one into
 * production would silently run every "real" payment through Stripe's test ledger: orders marked
 * paid, and no money ever actually moving. Checked outside development/test only; a test key is
 * exactly right there, `NODE_STRIPE_SECRET_KEY` unset included — there is no shipped
 * Stripe implementation yet, so this stays dormant until a deployment sets one.
 * @returns `['NODE_STRIPE_SECRET_KEY']` when a deployment boot is configured with a test-mode
 *   Stripe key; empty otherwise
 */
export const validateStripeSecretKey = (): string[] => {
    const key = process.env.NODE_STRIPE_SECRET_KEY;
    return !isRelaxedEnvironment() && key?.startsWith('sk_test_') ? ['NODE_STRIPE_SECRET_KEY'] : [];
};
