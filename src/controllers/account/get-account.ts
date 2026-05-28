import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@utils/response';
import { emitAnalyticsEvent, AnalyticsEvent } from '@utils/analytics';
import { getActiveSpanContext } from '@utils/tracer';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 */
export const getAccount = (request: Request, response: Response): void => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
<<<<<<< HEAD
    emitAnalyticsEvent({
        distinctId: request.user.id,
        event: AnalyticsEvent.USER_PROFILE_VIEWED,
        traceId: getActiveSpanContext().traceId
    });
    successResponse(response, request.user);
=======
    successResponse(response, request.authContext);
>>>>>>> origin/main
};
