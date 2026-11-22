/**
 * @module
 * Domain gauges this module owns — see `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without
 * importing here. Each is bound to an unused underscore-prefixed variable, the same way
 * `metrics-registry.ts`'s two process gauges do it: registering themselves is the constructor's
 * whole job, and nothing reads the handles.
 *
 * @see docs/modules/inventory.md#the-pipeline
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { reservationRepository, stockLevelRepository } from './repository';
import { inventoryService } from './services';

/**
 * How many products a customer would find unbuyable-ish, computed AT SCRAPE TIME via `collect`.
 * Counts AVAILABILITY, not units on hand — a product with forty units all reserved is out of
 * stock to every customer, so a gauge reading `onHand` would misreport it as available.
 * `lowStockCount` composes this module's own counters with `products`' visibility rule — see
 * that function's own docblock.
 */
const _productsLowStockTotal = new Gauge({
    name: 'products_low_stock_total',
    help: 'Products whose available units are at or under the low-stock threshold.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await inventoryService.lowStockCount());
    }
});

/**
 * Units currently promised to orders that have not been paid for. A steadily climbing total with
 * a flat sales rate means holds are being opened and never resolved — abandoned checkouts the
 * sweep isn't reaching, or a payment integration that stopped confirming.
 */
const _inventoryReservedUnitsTotal = new Gauge({
    name: 'inventory_reserved_units_total',
    help: 'Units held by open reservations across the catalogue.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await stockLevelRepository.sumReserved());
    }
});

/**
 * How long past its deadline a hold may stay `held` before it counts as overdue: twice the
 * 5-minute sweep interval (`docker/crontab`). One tick that is late or still draining never
 * trips it; a hold that is still there two ticks after its deadline has been refused or missed.
 */
const OVERDUE_HOLD_GRACE_MS = 10 * 60 * 1000;

/**
 * Holds the reservation sweep has not expired, though their deadline passed more than
 * {@link OVERDUE_HOLD_GRACE_MS} ago. Read at scrape time from Mongo because the sweep runs as a
 * one-shot job in the `cron` container, which Prometheus never scrapes: a counter bumped there
 * would be invisible. A hold the sweep cannot expire (its counters refuse) keeps its units
 * reserved and shows up here on every tick until a technician fixes it.
 *
 * @see docs/modules/inventory-reservations.md#when-a-hold-keeps-failing-to-expire
 */
const _inventoryOverdueHolds = new Gauge({
    name: 'inventory_overdue_holds',
    help: 'Holds still open more than 10 minutes past their deadline: the reservation sweep could not expire them.',
    registers: [metricsRegistry],
    async collect() {
        this.set(
            await reservationRepository.countHeldPastDeadline(
                new Date(Date.now() - OVERDUE_HOLD_GRACE_MS)
            )
        );
    }
});
