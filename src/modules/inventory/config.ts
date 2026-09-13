/**
 * @module
 * The two numbers a deployment tunes, read in one place — one file rather than a copy in each
 * consumer, since a second transcription is how the admin board and the gauge end up disagreeing
 * about what "low" means (not hypothetical: `lowStockThreshold` was written out twice here before
 * this file existed). Both are read per call rather than captured at import, so an operator
 * changing an env var affects the next request and tests can vary them per case.
 *
 * See: docs/modules/inventory.md
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * How long a hold survives without payment. Stamped at reserve time, so a change applies to new
 * checkouts and leaves promises already made alone.
 * @returns the reservation window in minutes
 */
export const reservationTtlMinutes = (): number =>
    environmentNumber('NODE_RESERVATION_TTL_MINUTES', 30, 0);

/**
 * The availability at or under which a product wants restocking. Deliberately shared by two
 * readers counting different populations — the stock board spans the whole catalogue, the gauge
 * only public products — so the two counts won't match, and shouldn't.
 * @returns the low-availability mark
 */
export const lowStockThreshold = (): number => environmentNumber('NODE_LOW_STOCK_THRESHOLD', 5, 0);
