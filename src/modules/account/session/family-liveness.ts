/**
 * @module
 * Whether a session FAMILY is still a session: it has a live row, and — for staff — it has not
 * idled out or outlived the lifetime cap. Shared by the `jwt` bearer (an access token names its family in `sid`) and by an open
 * SSE stream's recheck, which follows the family because a credential rotates under it.
 *
 * See: docs/theory/sessions.md#the-staff-idle-timeout
 */

import type { Resolution } from '@kernel/authentication';
import type { AuthContext, ResolveOptions } from '@types';
import { sessionRepository } from '../repository';
import type { SessionMode } from '../session-mode';
import { hasIdledOut, hasOutlivedStaffCap } from './idle';

/** How often a busy session may write its activity stamp. */
export const ACTIVITY_STAMP_INTERVAL_MS = 60_000;

/**
 * Resolve a family's caller, ending the session when it has idled out or outlived the staff cap,
 * and counting the request as activity otherwise.
 *
 * @param userId - the account the credential names
 * @param familyId - the session family
 * @param mode - the mode the family was minted under
 * @param resolveCaller - reads the caller the credential's proof names
 * @param options - `passive` requests are judged but never counted as activity
 * @returns a miss for a family with no live row, or one that idled out or outlived the staff cap
 *   (and is now revoked)
 */
export const resolveInLiveFamily = (
    userId: string,
    familyId: string,
    mode: SessionMode,
    resolveCaller: () => Promise<AuthContext | undefined>,
    options: ResolveOptions = {}
): Promise<Resolution<AuthContext | undefined>> => {
    const now = new Date();
    return Promise.all([
        sessionRepository.familyActivity(userId, familyId, mode, now),
        resolveCaller()
    ]).then(
        ([activity, ok]):
            | Resolution<AuthContext | undefined>
            | Promise<Resolution<AuthContext | undefined>> => {
            if (!activity) return { miss: 'revoked' };
            if (ok && hasIdledOut(activity.lastActiveAt, ok.roles, now))
                return sessionRepository
                    .removeFamily(userId, familyId)
                    .then((): Resolution<AuthContext | undefined> => ({ miss: 'idle' }));
            if (ok && hasOutlivedStaffCap(activity.startedAt, ok.roles, now))
                return sessionRepository
                    .removeFamily(userId, familyId)
                    .then((): Resolution<AuthContext | undefined> => ({ miss: 'expired' }));
            if (
                ok &&
                !options.passive &&
                (!activity.stampedAt ||
                    now.getTime() - activity.stampedAt.getTime() >= ACTIVITY_STAMP_INTERVAL_MS)
            )
                // Off the request's path: a lost stamp costs a stale reading only.
                void sessionRepository
                    .touchFamily(userId, familyId, now, ACTIVITY_STAMP_INTERVAL_MS)
                    .catch(() => false);
            return { ok };
        }
    );
};
