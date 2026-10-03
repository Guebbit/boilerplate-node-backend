/**
 * @module
 * The two VAT rates a deployment charges, read per call rather than captured at import — the
 * pattern `inventory/config.ts` sets, so a test can vary a rate per case. A rate change reaches
 * production with a restart, like every environment variable.
 *
 * Owned by `products` because `resolveTaxRate` (`./tax`) is the only reader: a product's tax
 * class resolving to a rate is an invariant of the catalogue. `orders` freezes whatever that
 * returns onto a line; it never reads a rate itself.
 */

import { defineConfig } from '@infrastructure/config/define';
import { decimal, text } from '@infrastructure/config/fields';

/**
 * The two VAT rates and the catalogue's currency.
 *
 * A rate is valid only inside `[0, 1)` — 1 (100%) or more is certainly a typo. Both are required
 * at boot; the defaults here are for `NODE_ENV=test`, which skips that check — the demo profile
 * does not: it sets both rates itself, the same as any other deployment must (SK-08).
 *
 * The currency is read directly rather than through `@modules/orders`'s own `shopCurrency` —
 * `orders` already depends on `products` for VAT, and the reverse import would close a module
 * cycle `.dependency-cruiser.modules.cjs` refuses outright. Same variable, same default, so a
 * deployment sets it once and both readers agree.
 */
export const productsConfig = defineConfig({
    name: 'products',
    shape: {
        NODE_VAT_RATE_DEFAULT: decimal({
            default: 0.22,
            min: 0,
            lessThan: 1,
            required: { minLength: 1 },
            describe: 'The VAT rate of a product with no tax class (0.22 is 22%).'
        }),
        NODE_VAT_RATE_REDUCED: decimal({
            default: 0.1,
            min: 0,
            lessThan: 1,
            required: { minLength: 1 },
            describe: 'The VAT rate of a product whose tax class is `reduced`.'
        }),
        NODE_DEFAULT_CURRENCY: text({
            default: 'EUR',
            describe: 'The one ISO-4217 currency this shop trades in.'
        })
    }
});

/**
 * The VAT rate applied to a product with no `taxClass` — the shop's default, and every product's
 * fallback.
 * @returns the configured decimal rate (0.22 for 22%)
 */
export const vatRateDefault = (): number => productsConfig().NODE_VAT_RATE_DEFAULT;

/**
 * The VAT rate applied to a product whose `taxClass` is `reduced` — books, food, medicine and
 * similar, depending on the deployment's own jurisdiction.
 * @returns the configured decimal rate (0.1 for 10%)
 */
export const vatRateReduced = (): number => productsConfig().NODE_VAT_RATE_REDUCED;

/**
 * The one ISO-4217 currency this deployment trades in — see {@link productsConfig} for why this
 * module reads it directly.
 * @returns the configured ISO-4217 currency code
 */
export const productCurrency = (): string => productsConfig().NODE_DEFAULT_CURRENCY;
