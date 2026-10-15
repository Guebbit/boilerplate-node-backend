/**
 * @module
 * What a fulfillment order keeps and for how long. The row is the record of what was promised and
 * what left, and stays; only the free text staff typed about a hold is wiped once the fulfillment
 * order has been quiet long enough.
 *
 * See: docs/theory/data-retention.md#free-text-on-holds
 */

import { logger } from '@infrastructure/adapters/logger';
import { fulfillmentOrderRepository } from '../repository';
import { holdNoteRetentionDays } from '../config';

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

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
