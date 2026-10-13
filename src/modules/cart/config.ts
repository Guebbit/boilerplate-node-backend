/**
 * @module
 * The cart's knobs: how long an untouched cart is kept, how many units one line may hold, and
 * how many unpaid orders one account may have open at checkout.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Cart retention and the denial-of-inventory caps. */
export const cartConfig = defineConfig({
    name: 'cart',
    shape: {
        NODE_CART_RETENTION_DAYS: int({ default: 365, min: 1 }),
        NODE_CART_LINE_MAX: int({ default: 10, min: 1, max: 999 }),
        NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: int({ default: 2, min: 1 })
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

/**
 * How many of one account's orders may sit unpaid (`pending`) at once, whatever the payment method.
 * Every one holds stock, for 15 minutes by card and a week by bank transfer or a `processing` card,
 * so this is what stops one account hoarding the shelf across many uncompleted orders (OWASP
 * automated threat OAT-021, Denial of Inventory).
 *
 * 2 and not 1: a failed card, or a closed 3-D Secure window, leaves a `pending` order until its
 * hold expires, and with 1 the retry would be refused meanwhile.
 * @returns the cap on open unpaid orders per account
 */
export const maxOpenUnpaidOrdersPerAccount = (): number =>
    cartConfig().NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT;
