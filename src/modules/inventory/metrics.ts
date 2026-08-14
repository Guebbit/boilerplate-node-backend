/**
 * Domain gauges this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';
import { productRepository } from '@modules/products';

/** Shelf counts at or under this ask for a restock. Lazily read — tests vary it per case. */
const lowStockThreshold = (): number => Number(process.env.NODE_LOW_STOCK_THRESHOLD ?? 5);

/**
 * How many products are running out, computed AT SCRAPE TIME via `collect` — a gauge that
 * counted events would drift from the shelf it describes, and the shelf is one cheap indexed
 * count away. The observability overview reads it by name, like every domain metric.
 */
export const productsLowStockTotal = new Gauge({
    name: 'products_low_stock_total',
    help: 'Products at or under the low-stock threshold.',
    registers: [metricsRegistry],
    async collect() {
        this.set(await productRepository.count({ stock: { $lte: lowStockThreshold() } }));
    }
});
