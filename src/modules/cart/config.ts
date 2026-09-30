/**
 * @module
 * The cart's one knob: how long an untouched cart is kept.
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
        })
    }
});
