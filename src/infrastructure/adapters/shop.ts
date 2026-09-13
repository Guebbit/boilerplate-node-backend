/**
 * @module
 * Shop identity and VAT rate configuration — plain values read directly from the environment,
 * same shape as `./bank-transfer`. Lives here rather than in `orders` or `products` because both
 * need it: `products` resolves a product's tax class into a rate, `orders` prints the shop's
 * identity on an invoice, and neither may import the other for it.
 */

import { environmentDecimal } from '@infrastructure/runtime/environment';

/**
 * The shop's own country — the ONLY jurisdiction VAT is ever charged at: no destination lookup,
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. Required in
 * production (`NODE_SHOP_COUNTRY`, checked at boot); read here defensively regardless, since
 * `NODE_ENV=test` and the demo profile both skip that check.
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
 * The VAT rate applied to a product with no `taxClass` — the shop's default, and every product's
 * fallback. Required in production; the boot check also range-checks it to `[0, 1)`, which this
 * getter does not repeat.
 * @returns the configured decimal rate (0.22 for 22%), or `0.22` when unset
 */
export const vatRateDefault = (): number => environmentDecimal('NODE_VAT_RATE_DEFAULT', 0.22);

/**
 * The VAT rate applied to a product whose `taxClass` is `reduced` — books, food, medicine and
 * similar, depending on the deployment's own jurisdiction.
 * @returns the configured decimal rate (0.1 for 10%), or `0.1` when unset
 */
export const vatRateReduced = (): number => environmentDecimal('NODE_VAT_RATE_REDUCED', 0.1);
