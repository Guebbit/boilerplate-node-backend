/**
 * @module
 * Domain gauges this module owns — see `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without
 * importing here. Both are bound to unused underscore-prefixed variables, the same way
 * `metrics-http.ts` does it: registering themselves is the constructor's whole job, and nothing
 * reads the handles.
 *
 * See: docs/modules/inventory.md
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';
import { productRepository } from '@modules/products';
import { lowStockThreshold } from './config';

/**
 * How many products a customer would find unbuyable-ish, computed AT SCRAPE TIME via `collect`.
 * Counts AVAILABILITY, not units on hand — a product with forty units all reserved is out of
 * stock to every customer, so a gauge reading `onHand` would misreport it as available.
 * `countLowAvailability` does the subtraction inside mongod.
 */
const _productsLowStockTotal = new Gauge({
    name: 'products_low_stock_total',
    help: 'Products whose available units are at or under the low-stock threshold.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await productRepository.countLowAvailability(lowStockThreshold()));
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
        this.set(await productRepository.sumReserved());
    }
});
