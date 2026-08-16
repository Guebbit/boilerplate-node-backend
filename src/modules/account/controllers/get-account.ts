import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { accountAnalyticsEvents } from '../analytics';

/**
 * GET /account
 * Returns the full profile of the authenticated user.
 */
export const getAccount = (request: Request, response: Response): void => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    emitAnalyticsEvent({
        ...buildAnalyticsBase(request),
        event: accountAnalyticsEvents.USER_PROFILE_VIEWED
    });
    successResponse(response, request.authContext);
};
