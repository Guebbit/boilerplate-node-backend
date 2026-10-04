/**
 * @module
 * The cart's knobs: how long an untouched cart is kept, and how many units one line may hold.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Cart retention. */
export const cartConfig = defineConfig({
    name: 'cart',
    shape: {
        NODE_CART_RETENTION_DAYS: int({
            default: 365,
            min: 1,
            describe: 'Days an untouched cart is kept. Changing it needs `db:sync`.'
        }),
        NODE_CART_LINE_MAX: int({
            default: 10,
            min: 1,
            max: 999,
            describe:
                'Units of one product a cart line (so one order) may hold. The contract keeps 999 as the hard ceiling; this is the shop’s own, lower, number, so one account cannot reserve a whole product at once.'
        })
    }
});

/**
 * The most units one cart line may hold, which is the most of one product a single order can
 * freeze. Read at write time, so changing it applies to the next write; a line filled before a
 * LOWER value is refused again at checkout instead of being quietly trimmed.
 *
 * It is one of the three knobs on denial of inventory (OWASP automated threat OAT-021): with the
 * open-order cap and the reservation window it bounds how much of the shelf one account can hold.
 * @returns the per-line ceiling, 1 to 999
 */
export const cartLineMax = (): number => cartConfig().NODE_CART_LINE_MAX;
