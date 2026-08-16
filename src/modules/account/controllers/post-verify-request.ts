import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { userRepository } from '@modules/users';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { sendVerificationEmail } from '../services';

/**
 * POST /account/verify-request
 * Re-send the email-verification link to the authenticated user.
 *
 * Signup already sends one; this exists for the mail that never arrived. Unlike the reset
 * request there is no enumeration surface to blur — the caller is authenticated and asks about
 * their own account — so an already-verified account gets an honest 409 instead of a soothing
 * 200 that would re-send nothing.
 */
export const postVerifyRequest = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return (
        userRepository
            // Credentials included: issuing the token pushes onto this document's `tokens`.
            .findByIdWithCredentials(id)
            .then((user) => {
                if (!user) {
                    rejectResponse(response, 404);
                    return;
                }
                if (user.verified) {
                    rejectResponse(response, 409, [t('account.verify.already-verified')]);
                    return;
                }

                return sendVerificationEmail(user, request.locale).then(() => {
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: accountAuditActions.AUTH_EMAIL_VERIFY_REQUESTED,
                            outcome: 'success'
                        })
                    );

                    successResponse(response, undefined, 200, t('account.verify.email-sent'));
                });
            })
            .catch((error: CastError | Error) => {
                rejectDatabaseError(response, 'postVerifyRequest', error);
            })
    );
};
