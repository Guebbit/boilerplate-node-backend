/**
 * @module
 * The shop's own LEGAL identity, as Art. 226(e) needs it printed on an invoice: the legal name,
 * VAT number, and full postal address. Read per call rather than captured at import — the pattern
 * `inventory/config.ts` sets, so a deployment can correct any of them without a restart.
 *
 * Owned here, not `orders`, because this module's own `services/issue-invoice.ts` is the only reader —
 * `orders/config.ts` keeps `shopCountry` alone, since that one is also the VAT-jurisdiction and
 * ship-to-country assumption `orders`/`cart` enforce at checkout, not an invoice-only fact.
 */

/**
 * The shop's legal name, printed on the invoice — distinct from any storefront brand name, which
 * this codebase does not otherwise configure.
 * @returns the configured legal name, or `undefined`
 */
export const shopLegalName = (): string | undefined =>
    process.env.NODE_SHOP_LEGAL_NAME || undefined;

/**
 * The shop's VAT identification number, printed on the invoice. Optional: a deployment below the
 * registration threshold, or not yet registered, prints no VAT number rather than a fake one.
 * @returns the configured VAT number, or `undefined`
 */
export const shopVatNumber = (): string | undefined =>
    process.env.NODE_SHOP_VAT_NUMBER || undefined;

/**
 * The shop's own street address — Art. 226(f) needs the seller's full postal address, not just
 * its country (`orders/config.ts#shopCountry`, the VAT-jurisdiction fact).
 * @returns the configured street, or `undefined`
 */
export const shopStreet = (): string | undefined => process.env.NODE_SHOP_STREET || undefined;

/**
 * The shop's own city — see {@link shopStreet}.
 * @returns the configured city, or `undefined`
 */
export const shopCity = (): string | undefined => process.env.NODE_SHOP_CITY || undefined;

/**
 * The shop's own postal code — see {@link shopStreet}.
 * @returns the configured postal code, or `undefined`
 */
export const shopZip = (): string | undefined => process.env.NODE_SHOP_ZIP || undefined;
