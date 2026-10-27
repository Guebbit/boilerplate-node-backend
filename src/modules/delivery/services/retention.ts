/**
 * @module
 * What delivery keeps and for how long. The rows are the record of what was promised and what
 * left, and stay; only personal text goes: the free text staff typed about a hold, once the
 * fulfillment order has been quiet long enough, the note typed about a lost parcel on the same
 * clock, and the address copy on each shipment, when the
 * order's own address is scrubbed.
 *
 * See: docs/theory/data-retention.md#free-text-on-holds
 */

import { logger } from '@infrastructure/adapters/logger';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import { holdNoteRetentionDays } from '../config';
import { DAY_MS } from '@domain-primitives/time';

/**
 * `reap:delivery`'s sweep. Unsets `holdNote` on every fulfillment order whose
 * `updatedAt` is older than `NODE_HOLD_NOTE_RETENTION_DAYS`. `updatedAt`, not a closing date: a
 * fulfillment order held forever never closes.
 *
 * @param now - the clock; injectable so a test needs no fake timers
 * @returns how many fulfillment orders lost their note
 */
export const scrubHoldNotes = (now: Date = new Date()): Promise<number> =>
    fulfillmentOrderRepository
        .scrubHoldNotesBefore(new Date(now.getTime() - holdNoteRetentionDays() * DAY_MS))
        .then((scrubbed) => {
            if (scrubbed > 0)
                // Stryker disable next-line all
                logger.info({ message: 'Wiped hold notes past retention.', scrubbed });
            return scrubbed;
        });

/**
 * `reap:delivery`'s second sweep: unsets `lostNote` on every shipment quiet for the same window as
 * a hold note. `lostMessage` stays: it was written for the buyer and mailed to them.
 *
 * @param now - the clock; injectable so a test needs no fake timers
 * @returns how many shipments lost their note
 */
export const scrubLostNotes = (now: Date = new Date()): Promise<number> =>
    shipmentRepository
        .scrubLostNotesBefore(new Date(now.getTime() - holdNoteRetentionDays() * DAY_MS))
        .then((scrubbed) => {
            if (scrubbed > 0)
                // Stryker disable next-line all
                logger.info({ message: 'Wiped loss notes past retention.', scrubbed });
            return scrubbed;
        });

/**
 * Wipe the address copy on every shipment of an order whose own address was just scrubbed
 * (`order.redacted`): a destination must not outlive the address it was copied from. Idempotent —
 * a redelivered event finds nothing left to unset.
 *
 * @param orderId - the redacted order
 * @returns how many shipments lost their destination
 */
export const scrubDestinations = (orderId: string): Promise<number> =>
    shipmentRepository.unsetDestinations(orderId);
