import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@utils/response';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 */
export const getAccount = (request: Request, response: Response): void => {
    if (!request.authContext) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }
    emitAnalyticsEvent({
        ...buildAnalyticsBase(request),
        event: AnalyticsEvent.USER_PROFILE_VIEWED
    });
    successResponse(response, request.authContext);
};
