/**
 * @module
 * The numbers a deployment tunes for stock, read per call rather than captured at import, so a
 * test can vary them per case. A process's environment is fixed at start: a deployment changes
 * them with a restart. The restock mark itself lives in `stockConfig`, shared with `products`.
 *
 * See: docs/modules/inventory.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';
import { stockConfig } from '@infrastructure/runtime/config';

/** Stock holds. */
export const inventoryConfig = defineConfig({
    name: 'inventory',
    shape: {
        NODE_RESERVATION_TTL_MINUTES: int({ default: 15, min: 0 })
    }
});

/**
 * How long a hold survives without payment. Stamped at reserve time, so a change applies to new
 * checkouts and leaves promises already made alone.
 * @returns the reservation window in minutes
 */
export const reservationTtlMinutes = (): number => inventoryConfig().NODE_RESERVATION_TTL_MINUTES;

/**
 * The availability at or under which a product wants restocking — the infrastructure's
 * `stockConfig`, which `products` reads too. Deliberately shared by two
 * readers counting different populations — the stock board spans the whole catalogue, the gauge
 * only public products — so the two counts won't match, and shouldn't.
 * @returns the low-availability mark
 */
export const lowStockThreshold = (): number => stockConfig().NODE_LOW_STOCK_THRESHOLD;
