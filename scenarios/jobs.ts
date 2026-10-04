/**
 * @module
 * The demo profile's job levers: a background job a journey can run on demand.
 *
 * A time journey moves the clock (`POST /__test/clock`), then runs the job whose rule it just
 * made true. Each entry calls the same service function its `scripts/ops/` script calls, so the
 * lever proves the real sweep, not a copy of it.
 *
 * Reached through `POST /__test/jobs/:name` in `./support/demo.ts`.
 */

import { orderService } from '@modules/orders';

/**
 * Every job a journey may run, by the name in the URL.
 *
 * A map rather than an object: the names are URL segments (`reap-orders`), and a lookup by an
 * arbitrary segment must never find an inherited property such as `constructor`.
 * Each job returns what its sweep counted, so a spec can assert it really did something.
 */
export const DEMO_JOBS: ReadonlyMap<string, () => Promise<number>> = new Map([
    // `reap:orders` — scrubs the PII of orders past their retention window.
    ['reap-orders', () => orderService.anonymizeDueOrders()]
]);
