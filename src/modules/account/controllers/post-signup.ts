import type { Request, Response } from 'express';
import { authService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { resolveImageUrl } from '@infrastructure/http/uploads';
import { imageStore } from '@infrastructure/adapters/image-store';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import type { CastError } from 'mongoose';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authSignupTotal } from '../metrics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@infrastructure/observability/analytics';

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
    const imageUrlFile = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? (request.body as { imageUrl?: string }).imageUrl ?? '';
    // If problem arises: remove the image THIS request uploaded — `imageUrlFile`, deliberately,
    // and not the merged `imageUrl`: a body-supplied url names an image this request did not
    // create, and deleting it because validation failed would destroy someone else's file.
    const deleteUpload = () => imageStore.remove(imageUrlFile);

    /**
     * Register
     */
    return authService
        .signup(email, username, password, passwordConfirm, imageUrl)
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    authSignupTotal.inc({ status: 'failure' });
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: accountAuditActions.AUTH_SIGNUP_FAILED,
                            actor_user_id: 'anonymous',
                            actor_role: 'anonymous',
                            outcome: 'failure'
                        })
                    );
                    rejectResponse(response, result.status, result.errors);
                });

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            const newUserId = result.data?.id ?? 'unknown';
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: accountAuditActions.AUTH_SIGNUP_SUCCEEDED,
                    actor_user_id: newUserId,
                    actor_role: 'user',
                    outcome: 'success'
                })
            );
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                distinctId: newUserId,
                event: analyticsEvents.USER_SIGNED_UP
            });
            // create() returns the in-memory document; the schema's toJSON transform
            // strips the hashed password before it ever reaches res.json
            successResponse(response, result.data, 201);
        })
        .catch((error: CastError | Error) => {
            authSignupTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'signup', error);
            return deleteUpload();
        });
};
