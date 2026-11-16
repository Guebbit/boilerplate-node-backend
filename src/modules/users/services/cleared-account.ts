/**
 * @module
 * The opening every staff action on an account shares: load it, 404 when it is missing, refuse
 * with 403 when the caller may not manage a staff account. One home, because a copy that drifts
 * is a privilege bug.
 *
 * @see docs/modules/users.md#soft-delete-vs-erasure
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import type { CallerContext } from '@types';
import { accessService } from '@modules/access';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';

/**
 * Load the account and clear what any action on it must clear: it exists, and the caller may
 * change it.
 *
 * @internal A step behind a guarded door: it runs the check, so it is the check. Unpublished: a
 * sibling that reached for the loaded account without it would skip the staff-role protection.
 *
 * @param context - the caller, judged against the account
 * @param next - what to do with the loaded account once cleared
 * @returns what `next` answers; 404 when there is no such account, 403 `ROLE_MANAGEMENT_REQUIRED`
 *   for a staff account the caller may not manage
 */
export const withClearedAccount = <T>(
    id: string,
    context: CallerContext,
    next: (user: UserDocument) => Promise<T | ResponseReject> | T | ResponseReject
): Promise<T | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a database error.
        if (!user) return generateReject(404, [t('users.not-found')]);

        return accessService
            .roleProtectedRefusal(context, id)
            .then((refusal) => refusal ?? next(user));
    });
