/**
 * @module
 * Admin-assisted 2FA recovery, the one audited exception to "a code is always required".
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext } from '@types';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAuditActions } from '../audit';

/**
 * Admin-assisted 2FA recovery: unconditionally strips EVERY second factor, no code required.
 * The door that stays shut everywhere else — self-service disable and the login challenge both
 * demand a code — because a mailbox-based reset would make 2FA only as strong as the inbox it
 * exists to defend against. This is the one deliberate exception, and it is audited.
 *
 * `findByIdWithCredentials`, not `findById`: the 2FA fields are `select: false`, and unsetting a
 * path Mongoose never loaded registers as no change at all — `save()` would silently do nothing.
 *
 * @param id - the user whose second factor is being removed
 * @param context - the admin's caller context, for the audit record
 */
export const adminDisableTwoFactor = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    const outcome = userRepository
        .findByIdWithCredentials(id)
        .then<ResponseSuccess<UserDocument> | ResponseReject>((user) => {
            if (!user) return generateReject(404, [t('users.not-found')]);

            user.twoFactorMethods = [];
            user.twoFactorEnabledAt = undefined;
            user.twoFactorBackupCodes = [];
            user.twoFactorBackupCodeSalt = undefined;
            // Emptying an array Mongoose loaded is a change it sees; the field-level unsets the
            // 2FA services have to mark by hand do not apply here.
            return userRepository.save(user).then((saved) => generateSuccess(saved));
        });

    return outcome.then((result) => {
        recordAudit(context, {
            action: usersAuditActions.ADMIN_USER_2FA_DISABLED,
            target_type: 'user',
            target_id: id,
            outcome: result.success ? 'success' : 'failure'
        });
        return result;
    });
};
