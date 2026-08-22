/**
 * The two numbers a deployment tunes, read in one place.
 *
 * Both are read per call rather than captured at import: an operator changing an env var should
 * affect the next request, and tests vary them per case.
 *
 * One file rather than a copy in each consumer, because both have more than one reader and a
 * second transcription is how the admin board and the gauge end up disagreeing about what "low"
 * means. That is not hypothetical — `lowStockThreshold` was written out twice here before this
 * file existed.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * How long a hold survives without payment.
 *
 * Stamped onto each hold at reserve time, so a change applies to new checkouts and leaves promises
 * already made alone.
 *
 * @returns the reservation window in minutes
 */
export const reservationTtlMinutes = (): number =>
    environmentNumber('NODE_RESERVATION_TTL_MINUTES', 30, 0);

/**
 * The availability at or under which a product wants restocking.
 *
 * One threshold, two readers, and they deliberately count different POPULATIONS: the stock board's
 * `lowOnly` filter spans the whole catalogue, because an admin restocking needs to see an inactive
 * product's units, while `products_low_stock_total` counts only publicly visible products, because
 * an alert about stock a customer cannot buy is noise. Sharing the number and differing on the
 * population is the intended arrangement; the two counts will not match, and should not.
 *
 * @returns the low-availability mark
 */
export const lowStockThreshold = (): number => environmentNumber('NODE_LOW_STOCK_THRESHOLD', 5, 0);
