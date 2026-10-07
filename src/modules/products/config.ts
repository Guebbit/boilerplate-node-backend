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
import { decimal, int } from '@infrastructure/config/fields';
import { currencyConfig } from '@infrastructure/runtime/config';

/**
 * The two VAT rates and the low-stock threshold.
 *
 * A rate is valid only inside `[0, 1)` — 1 (100%) or more is certainly a typo. Both are required
 * at boot; the defaults here are for `NODE_ENV=test`, which skips that check — the demo profile
 * does not: it sets both rates itself, the same as any other deployment must.
 *
 * The low-stock threshold is the variable `@modules/inventory` reads for its restock board,
 * declared again here: `inventory` depends on `products`, so this module cannot import it. It is what turns an exact count into the `lowStock` flag a
 * shopper may see.
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
        NODE_LOW_STOCK_THRESHOLD: int({
            default: 5,
            min: 0,
            describe: 'Availability at or under which a product wants restocking.'
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
 * The one ISO-4217 currency this deployment trades in — the infrastructure's `currencyConfig`,
 * which `orders` reads too.
 * @returns the configured ISO-4217 currency code
 */
export const productCurrency = (): string => currencyConfig().NODE_DEFAULT_CURRENCY;

/**
 * The availability at or under which a product reads as low on stock — the same
 * `NODE_LOW_STOCK_THRESHOLD` `@modules/inventory` flags a restock with, so the storefront's badge
 * and the stock board agree.
 * @returns the configured threshold, in units
 */
export const lowStockThreshold = (): number => productsConfig().NODE_LOW_STOCK_THRESHOLD;
