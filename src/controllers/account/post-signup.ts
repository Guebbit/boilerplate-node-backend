import type { Request, Response } from 'express';
import { authService } from '@services/auth';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import type { CastError } from 'mongoose';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { authSignupTotal } from '@utils/domain-metrics';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * POST /account/signup
 * Register a new user account.
 */
export const postSignup = (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response
) => {
    /**
     * Get POST data
     */
    const { email, username, password, passwordConfirm } = request.body;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Register
     */
    return authService
        .signup(email, username, password, passwordConfirm, imageUrl ?? request.body.imageUrl)
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    authSignupTotal.inc({ status: 'failure' });
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: AuditAction.AUTH_SIGNUP_FAILED,
                            actor_user_id: 'anonymous',
                            actor_role: 'anonymous',
                            outcome: 'failure'
                        })
                    );
                    rejectResponse(response, result.status, result.message, result.errors);
                });

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            const newUserId = result.data?.id ?? 'unknown';
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.AUTH_SIGNUP_SUCCEEDED,
                    actor_user_id: newUserId,
                    actor_role: 'user',
                    outcome: 'success'
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                distinctId: newUserId,
                event: AnalyticsEvent.USER_SIGNED_UP
            });
            successResponse(response, result.data, 201);
        })
        .catch((error: CastError | Error) => {
            const [status, message] = databaseErrorInterpreter(error);
            authSignupTotal.inc({ status: 'failure' });
            rejectResponse(response, status, message);
            return deleteUpload();
        });
};
