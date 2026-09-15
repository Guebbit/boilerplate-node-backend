/**
 * @module
 * The shop's own identity as it appears on an invoice, read per call rather than captured at
 * import — the pattern `inventory/config.ts` sets, so a deployment can correct a legal name
 * without a restart.
 *
 * Owned by `orders` because `./emails`' invoice payload is the only reader. The VAT RATES are a
 * different thing with a different owner — `products` resolves those (`@modules/products`'s
 * `config.ts`), and this module only freezes the number it is handed.
 */

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
