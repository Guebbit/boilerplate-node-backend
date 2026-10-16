/**
 * @module
 * Controller for `POST /analytics/events`. The body is a closed set of browsing events; anything
 * else is a 422. What happens next is the analytics port's call: without consent it drops the
 * event, and the answer is the same 204 either way, so a response never tells a page whether it
 * was measured.
 *
 * See: docs/modules/analytics.md
 */

import type { Request, Response } from 'express';
import { CreateAnalyticsEventBody } from '@api/schemas.zod';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { analyticsService } from '../services';
import type { AnalyticsEventRequest } from '@types';

/**
 * POST /analytics/events (public)
 * Hand one browsing event to the analytics provider, if the visitor consented.
 */
export const postAnalyticsEvent = (
    request: Request<unknown, unknown, AnalyticsEventRequest>,
    response: Response
) => {
    const body = parseBody(CreateAnalyticsEventBody, request.body, response);
    if (!body) return;

    return Promise.resolve()
        .then(() => {
            analyticsService.relayEvent(body, callerContextOf(request));
            response.status(204).end();
        })
        .catch(catchAs(response, 'postAnalyticsEvent'));
};
