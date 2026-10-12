/**
 * @module
 * The account's `lastActiveAt` stamp, written whenever a session is minted or kept alive — the
 * clock the inactivity reaper measures. Shared by both session modes.
 */

import { logger } from '@infrastructure/adapters/logger';
import { userService } from '@modules/users';

/**
 * Stamp the account as active. Never rejects: a lost stamp costs a stale reading, nothing more,
 * and a valid session must not fail on it. The once-a-day throttle lives in the users repository.
 *
 * @param userId - the account a session was just minted or kept alive for
 */
export const recordActivity = (userId: string): Promise<void> =>
    userService.touchLastActive(userId).catch((error: unknown) => {
        // Stryker disable next-line all
        logger.warn({ message: 'Could not stamp the account as active.', userId, error });
    });
