/**
 * @module
 * The shop's own identity as it appears on an invoice, the bank-transfer payment method's
 * deployment config, and the invoice render cache's own two knobs — all read per call rather than
 * captured at import, the pattern `inventory/config.ts` sets, so a deployment can correct any of
 * them without a restart.
 *
 * Owned by `orders` because `./emails`' invoice payload is the only reader of the shop identity.
 * The bank-transfer values are owned here for a different reason: `orders` renders
 * `transferInstructions` on its own responses AND enforces the open-transfer cap at order
 * creation, so a business rule about how many pending transfers one account may hold belongs with
 * the entity it constrains, not in `infrastructure`. `payments` and `cart` read these through
 * `services/index.ts`'s re-export (a module's public barrel may only publish services/domain/
 * events/emails/model, never a bare `config` — see `local/barrel-allowed-sources`); the VAT RATES
 * are a different thing with a different owner — `products` resolves those
 * (`@modules/products`'s `config.ts`), and this module only freezes the number it is handed.
 */

import path from 'node:path';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { isDemoMode } from '@infrastructure/runtime/demo-profile';

/**
 * The shop's own country — the ONLY jurisdiction VAT is ever charged at: no destination lookup,
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. Required at
 * boot via this module's manifest; read defensively regardless, since `NODE_ENV=test` and the demo
 * profile both skip that check.
 * @returns the configured ISO-3166 country code, or `undefined`
 */
export const shopCountry = (): string | undefined => process.env.NODE_SHOP_COUNTRY || undefined;

/**
 * The shop's VAT identification number, printed on the invoice. Optional: a deployment below the
 * registration threshold, or not yet registered, prints no VAT number rather than a fake one.
 * @returns the configured VAT number, or `undefined`
 */
export const shopVatNumber = (): string | undefined =>
    process.env.NODE_SHOP_VAT_NUMBER || undefined;

/**
 * The shop's legal name, printed on the invoice — distinct from any storefront brand name, which
 * this codebase does not otherwise configure.
 * @returns the configured legal name, or `undefined`
 */
export const shopLegalName = (): string | undefined =>
    process.env.NODE_SHOP_LEGAL_NAME || undefined;

/**
 * The ISO-4217 code every amount on the invoice is formatted in. Same env var and default
 * `payments/config.ts#defaultCurrency` reads — `orders` cannot import `payments` (the dependency
 * runs the other way), so this is its own one-line read rather than a cross-module reach; a shop
 * that ever needs a second currency needs a real design, not two modules quietly disagreeing.
 * @returns the configured ISO-4217 currency code
 */
export const invoiceCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';

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
 * the validation it pairs with, in `payments`, and duplicating the package's one import here would
 * cost `ibantools` its single-module ownership on the generated
 * `docs/tools/package-dependencies.md` page, for a four-character chunking rule with no edge case
 * to get wrong.
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

/**
 * Where a rendered invoice may be cached, resolved against the WORKING DIRECTORY when relative —
 * same as `NODE_QUARANTINE_PATH`, and, like it, must stay OUTSIDE `NODE_PUBLIC_PATH`: an invoice
 * carries personal and financial data, and must only be reachable through the authenticated
 * `GET /orders/{id}/invoice`, never as a guessable static url.
 * @returns the cache directory
 */
export const invoiceCachePath = (): string =>
    path.resolve(process.env.NODE_INVOICE_CACHE_PATH ?? 'storage/invoices');

/**
 * How long a rendered invoice stays cached — long enough to absorb one person's burst (download,
 * view, re-download), never long enough to make the cache a second copy of the order's own
 * retention. `0` under `isDemoMode()` or `NODE_ENV === 'test'`, WHATEVER the env says: a `0` TTL
 * means the render never touches the disk at all, so a demo deployment or a test run never leaves
 * PII behind it did not mean to keep.
 * @returns the TTL, in minutes; `0` means "never cache"
 */
export const invoiceCacheTtlMinutes = (): number => {
    if (isDemoMode() || process.env.NODE_ENV === 'test') return 0;
    return environmentNumber('NODE_INVOICE_CACHE_TTL_MINUTES', 5, 0);
};
