import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmEmailVerificationBody } from '@api/schemas.zod';
import { userService } from '@modules/users';
import { userRepository } from '@modules/users';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { VerifyEmailConfirmRequest } from '@types';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authEmailVerifyTotal } from '../metrics';
import { EMAIL_VERIFY_TOKEN_TYPE } from '../verification';

/**
 * POST /account/verify-confirm
 * Spend a one-time verification token and mark the account's email as verified.
 *
 * Public deliberately, like `reset-confirm` and `delete-confirm`: the link arrives by email and
 * the visitor following it is not necessarily logged in — the token in the body is the
 * credential. The same three-step shape as `postResetConfirm`, for the same race: find, check
 * expiry, then let the atomic consume decide which of two simultaneous clicks was first. The
 * loser gets the same "token not found" an invented token gets, because from its point of view
 * that is what happened.
 */
export const postVerifyConfirm = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmEmailVerificationBody.safeParse(request.body);
    if (!parseResult.success) {
        authEmailVerifyTotal.inc({ status: 'failure' });
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );
    }

    const { token } = parseResult.data;

    return userService
        .findByEmailVerifyToken(token)
        .then((user) => {
            if (!user) {
                authEmailVerifyTotal.inc({ status: 'failure' });
                rejectResponse(response, 422, [t('account.verify.token-not-found')]);
                return;
            }

            const tokenEntry = user.tokens.find(
                (tk) => tk.token === token && tk.type === EMAIL_VERIFY_TOKEN_TYPE
            );
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                authEmailVerifyTotal.inc({ status: 'failure' });
                rejectResponse(response, 422, [t('account.verify.token-not-found')]);
                return;
            }

            return userService.consumeToken(user, token).then((spentByThisRequest) => {
                if (!spentByThisRequest) {
                    authEmailVerifyTotal.inc({ status: 'failure' });
                    rejectResponse(response, 422, [t('account.verify.token-not-found')]);
                    return;
                }

                user.verified = true;
                return userRepository.save(user).then(() => {
                    authEmailVerifyTotal.inc({ status: 'success' });
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: accountAuditActions.AUTH_EMAIL_VERIFY_COMPLETED,
                            actor_user_id: user.id,
                            actor_role: user.admin ? 'admin' : 'user',
                            outcome: 'success'
                        })
                    );

                    successResponse(response, undefined, 200, t('account.verify.success'));
                });
            });
        })
        .catch(() => {
            authEmailVerifyTotal.inc({ status: 'failure' });
            rejectResponse(response, 500, []);
        });
};
