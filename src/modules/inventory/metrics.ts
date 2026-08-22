/**
 * Domain gauges this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without
 * importing here.
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';
import { productRepository } from '@modules/products';
import { lowStockThreshold } from './config';

/**
 * How many products a customer would find unbuyable-ish, computed AT SCRAPE TIME via `collect`.
 *
 * A gauge that counted events would drift from the shelf it describes, and the shelf is one
 * indexed count away.
 *
 * It counts AVAILABILITY, not units on hand, and the difference is the whole metric: a product
 * with forty units all reserved is out of stock to every customer looking at it, so a gauge
 * reading `onHand` would report forty while the storefront showed a sold-out badge.
 * `countLowAvailability` does the subtraction inside mongod.
 */
export const productsLowStockTotal = new Gauge({
    name: 'products_low_stock_total',
    help: 'Products whose available units are at or under the low-stock threshold.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await productRepository.countLowAvailability(lowStockThreshold()));
    }
});

/**
 * Units currently promised to orders that have not been paid for.
 *
 * The number that says whether the reservation window is doing its job. A steadily climbing
 * `reserved` total with a flat sales rate means holds are being opened and never resolved —
 * abandoned checkouts the sweep is not reaching, or a payment integration that has stopped
 * confirming. Neither is visible in a stock count alone, which is exactly why the previous
 * single-counter model could not have had this metric at all.
 */
export const inventoryReservedUnitsTotal = new Gauge({
    name: 'inventory_reserved_units_total',
    help: 'Units held by open reservations across the catalogue.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await productRepository.sumReserved());
    }
});
