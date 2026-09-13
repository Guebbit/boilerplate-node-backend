/**
 * @module
 * Bank-transfer deployment config: the account a customer transfers to, and how long checkout
 * holds stock for choosing that method. Plain values only, read directly from the environment —
 * no `ibantools` here, so `payments` stays that package's only importer per
 * `docs/theory/modules.md#libraries-a-module-owns`. This file exists because `orders` needs the
 * same beneficiary/IBAN/BIC to render `transferInstructions` on its own responses and may not
 * depend on `payments` — see `docs/theory/modules.md#the-infrastructure-kernel-line`.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * The account name a transfer should be made out to. Unset means transfer is not offered at all.
 * @returns the configured beneficiary, or `undefined`
 */
export const bankTransferBeneficiary = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_BENEFICIARY || undefined;

/**
 * The account IBAN, exactly as configured — whatever shape it was typed in, spaces included.
 * `payments`' boot check runs it through `ibantools`' own `electronicFormatIBAN` before
 * validating, so this getter does no normalising of its own.
 * @returns the configured IBAN, or `undefined`
 */
export const bankTransferIban = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_IBAN || undefined;

/**
 * The IBAN grouped into 4-character blocks, the way a bank's own transfer form shows one — what
 * the customer actually copies. Not `ibantools`' `friendlyFormatIBAN`: that call belongs beside
 * the validation it pairs with, and duplicating the package's one import here would cost
 * `ibantools` its single-module ownership on the generated `docs/tools/package-dependencies.md`
 * page, for a four-character chunking rule with no edge case to get wrong.
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
export const bankTransferBic = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_BIC || undefined;

/**
 * How long checkout holds stock for a `bank_transfer` order before the reservation sweep
 * releases it — a week by default, since a transfer is not a same-day action the way a card is.
 * @returns the hold window, in hours
 */
export const bankTransferHoldHours = (): number =>
    environmentNumber('NODE_BANK_TRANSFER_HOLD_HOURS', 168, 1);

/**
 * How many of one account's orders may sit `pending` on a transfer at once. A week-long hold is
 * otherwise free to take — this is what stops one account hoarding stock across many
 * uncompleted orders.
 * @returns the cap on open transfer orders per account
 */
export const bankTransferMaxOpenPerAccount = (): number =>
    environmentNumber('NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT', 2, 0);

/**
 * Whether this deployment offers `bank_transfer` at all — both the beneficiary and the IBAN must
 * be set. `GET /payments/methods` reads this; checkout refuses the method when it is `false`.
 * @returns `true` once both are configured
 */
export const bankTransferEnabled = (): boolean =>
    Boolean(bankTransferBeneficiary() && bankTransferIban());
