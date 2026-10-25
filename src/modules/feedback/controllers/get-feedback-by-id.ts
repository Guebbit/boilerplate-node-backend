/**
 * @module
 * Controller for `GET /feedback/:id` — `read:Feedback`, one ticket of the admin queue.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { feedbackRequestService } from '../service';
import { presentFeedbackRequest } from '../presenter';

/**
 * GET /feedback/:id (admin)
 * One feedback ticket. A malformed or unknown id both answer 404.
 */
export const getFeedbackById = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return Promise.resolve();

    return feedbackRequestService
        .getById(id)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, presentFeedbackRequest(result.data), 200);
        })
        .catch(catchAs(response, 'getFeedbackById'));
};
