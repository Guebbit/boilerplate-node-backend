/**
 * @module
 * Pruning ONE account's expired tokens: the contained housekeeping step a login and a refresh run
 * on their own account. The nightly `reap:expired-tokens` job does the same for everyone
 * (`../services/token-cleanup.ts`), on the same predicate.
 */

import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { getReuseDetectionWindowMilliseconds } from './config';

/**
 * Prune ONE account's expired tokens, on the same predicate as the nightly reaper's. Run by a
 * login for the account it just authenticated, and by a refresh for the account whose token it
 * just rotated, so a user who signs in routinely does not accumulate dead entries between reaper
 * runs.
 *
 * Contained on purpose: housekeeping must never fail the request that triggered it. The raw
 * `error` is logged whole — `redactFormat` (`adapters/logger.ts`) serialises an `Error` into
 * `{name, message, stack}`, so passing it intact is what keeps the stack in the log line.
 *
 * Never run AHEAD of a rotation's own lookup: the rotation reads the presented token's entry to
 * tell a benign race from reuse, and a prune before that read could take the entry with it.
 *
 * @param userId - the account to prune
 */
export const pruneOwnExpiredTokens = (userId: string): Promise<void> =>
    userService
        .tokenRemoveExpired(getReuseDetectionWindowMilliseconds(), userId)
        .then(() => undefined)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({ message: 'Token prune failed', userId, error });
            // Stryker restore all
        });
