/**
 * @module
 * The values a deployment tunes about money, read in one place — same arrangement as
 * `@modules/inventory`'s `config.ts`: read per call so a change takes effect on the next intent,
 * not the next restart, and so a second reader doesn't transcribe its own copy of the fallback.
 *
 * The bank-transfer VALUES themselves (`bankTransferBeneficiary`/`Iban`/`Bic`) live in
 * `@infrastructure/adapters/bank-transfer` — `orders` needs them too, and may not import this
 * module. This file owns the one thing that IS this module's alone: validating them with
 * `ibantools` at boot, and listing the methods `GET /payments/methods` answers.
 */

import { electronicFormatIBAN, isValidBIC, isValidIBAN } from 'ibantools';
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban
} from '@infrastructure/adapters/bank-transfer';

/**
 * The currency every payment is denominated in — ISO-4217, one per deployment. Stamped onto each
 * payment at intent time, so a later config change never relabels money already taken.
 *
 * @returns the ISO-4217 code to stamp on new payments; `EUR` if unset
 */
export const defaultCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';

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
