/**
 * @module
 * The shop's own LEGAL identity, as Art. 226(e) needs it printed on an invoice: the legal name,
 * VAT number, and full postal address. Read per call rather than captured at import — the pattern
 * `inventory/config.ts` sets, so a test can vary any of them per case. A deployment corrects one
 * with a restart.
 *
 * Owned here, not `orders`, because this module's own `services/issue-invoice.ts` is the only reader —
 * `orders/config.ts` keeps `shopCountry` alone, since that one is also the VAT-jurisdiction and
 * ship-to-country assumption `orders`/`cart` enforce at checkout, not an invoice-only fact.
 */

import { defineConfig } from '@infrastructure/config/define';
import { text } from '@infrastructure/config/fields';

/** The seller's identity as an invoice prints it, and how the document is issued. */
export const invoicingConfig = defineConfig({
    name: 'invoicing',
    shape: {
        NODE_SHOP_LEGAL_NAME: text({ describe: 'The shop’s legal name, printed on the invoice.' }),
        NODE_SHOP_VAT_NUMBER: text({
            describe: 'VAT identification number. Unset prints none rather than a fake one.'
        }),
        NODE_SHOP_STREET: text({ describe: 'The shop’s street address (Art. 226(f)).' }),
        NODE_SHOP_CITY: text({ describe: 'The shop’s city.' }),
        NODE_SHOP_ZIP: text({ describe: 'The shop’s postal code.' }),
        NODE_EINVOICING_PROVIDER: text({
            default: 'pdf',
            lower: true,
            describe: 'The e-invoicing implementation. Only `pdf` ships.'
        })
    }
});

/**
 * The shop's legal name, printed on the invoice — distinct from any storefront brand name, which
 * this codebase does not otherwise configure.
 * @returns the configured legal name, or `undefined`
 */
export const shopLegalName = (): string | undefined => invoicingConfig().NODE_SHOP_LEGAL_NAME;

/**
 * The shop's VAT identification number, printed on the invoice. Optional: a deployment below the
 * registration threshold, or not yet registered, prints no VAT number rather than a fake one.
 * @returns the configured VAT number, or `undefined`
 */
export const shopVatNumber = (): string | undefined => invoicingConfig().NODE_SHOP_VAT_NUMBER;

/**
 * The shop's own street address — Art. 226(f) needs the seller's full postal address, not just
 * its country (`orders/config.ts#shopCountry`, the VAT-jurisdiction fact).
 * @returns the configured street, or `undefined`
 */
export const shopStreet = (): string | undefined => invoicingConfig().NODE_SHOP_STREET;

/**
 * The shop's own city — see {@link shopStreet}.
 * @returns the configured city, or `undefined`
 */
export const shopCity = (): string | undefined => invoicingConfig().NODE_SHOP_CITY;

/**
 * The shop's own postal code — see {@link shopStreet}.
 * @returns the configured postal code, or `undefined`
 */
export const shopZip = (): string | undefined => invoicingConfig().NODE_SHOP_ZIP;
