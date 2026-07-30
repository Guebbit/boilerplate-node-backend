import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@core/http/response';
import {
    emitAnalyticsEvent,
    AnalyticsEvent,
    buildAnalyticsBase
} from '@core/observability/analytics';

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
