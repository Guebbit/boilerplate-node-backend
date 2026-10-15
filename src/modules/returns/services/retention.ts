/**
 * @module
 * What a return keeps and for how long. The row is a legal record and stays; only the free text
 * a person typed (or staff wrote about them) is wiped once the return has been quiet long enough.
 *
 * See: docs/theory/data-retention.md#free-text-on-returns
 */

import { logger } from '@infrastructure/adapters/logger';
import { returnRepository } from '../repository';
import { returnTextRetentionDays } from '../config';

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `scripts/ops/reap-returns.ts`'s sweep. Unsets `note` and `declineReason` on every return whose
 * `updatedAt` is older than `NODE_RETURN_TEXT_RETENTION_DAYS`. `updatedAt`, not the closing date:
 * an approved return whose goods never arrive never closes.
 *
 * @returns how many returns lost their text
 */
export const scrubReturnText = (): Promise<number> =>
    returnRepository
        .scrubFreeTextBefore(new Date(Date.now() - returnTextRetentionDays() * DAY_MS))
        .then((scrubbed) => {
            if (scrubbed > 0)
                // Stryker disable next-line all
                logger.info({ message: 'Wiped free text on returns past retention.', scrubbed });
            return scrubbed;
        });
