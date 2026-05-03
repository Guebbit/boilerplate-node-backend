import type { Request, Response } from 'express';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import type { CastError } from 'mongoose';
import { databaseErrorInterpreter } from '@utils/helpers-errors';
import { authSignupTotal } from '@utils/domain-metrics';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';

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
    return userService
        .signup(email, username, password, passwordConfirm, imageUrl ?? request.body.imageUrl)
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    authSignupTotal.inc({ status: 'failure' });
                    emitAuditEvent({
                        action: AuditAction.AUTH_SIGNUP_FAILED,
                        actor_user_id: 'anonymous',
                        actor_role: 'anonymous',
                        outcome: 'failure',
                        ...extractRequestContext(request)
                    });
                    rejectResponse(response, result.status, result.message, result.errors);
                });

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            const newUserId = String((result.data as { _id?: unknown })?._id ?? 'unknown');
            emitAuditEvent({
                action: AuditAction.AUTH_SIGNUP_SUCCEEDED,
                actor_user_id: newUserId,
                actor_role: 'user',
                outcome: 'success',
                ...extractRequestContext(request)
            });
            emitAnalyticsEvent({
                distinctId: newUserId,
                event: AnalyticsEvent.USER_SIGNED_UP,
                traceId: request.traceContext?.traceId,
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
