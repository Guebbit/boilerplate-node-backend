/**
 * @module
 * The two numbers a deployment tunes, read in one place — one file rather than a copy in each
 * consumer, since a second transcription is how the admin board and the gauge end up disagreeing
 * about what "low" means. Both are read per call rather than captured at import, so a test can
 * vary them per case. A process's environment is fixed at start: a deployment changes them with a
 * restart.
 *
 * See: docs/modules/inventory.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Stock holds and the restock mark. */
export const inventoryConfig = defineConfig({
    name: 'inventory',
    shape: {
        NODE_RESERVATION_TTL_MINUTES: int({
            default: 30,
            min: 0,
            describe: 'Minutes a stock hold survives without payment.'
        }),
        NODE_LOW_STOCK_THRESHOLD: int({
            default: 5,
            min: 0,
            describe: 'Availability at or under which a product wants restocking.'
        })
    }
});

/**
 * How long a hold survives without payment. Stamped at reserve time, so a change applies to new
 * checkouts and leaves promises already made alone.
 * @returns the reservation window in minutes
 */
export const reservationTtlMinutes = (): number => inventoryConfig().NODE_RESERVATION_TTL_MINUTES;

/**
 * The availability at or under which a product wants restocking. Deliberately shared by two
 * readers counting different populations — the stock board spans the whole catalogue, the gauge
 * only public products — so the two counts won't match, and shouldn't.
 * @returns the low-availability mark
 */
export const lowStockThreshold = (): number => inventoryConfig().NODE_LOW_STOCK_THRESHOLD;
