/**
 * @module
 * Controller for `DELETE /feedback/:id` — `feedback.any.delete`, permanent. Hand-written rather than built
 * on `createDeleteController`: that factory exists for the soft/hard delete triplet, and this
 * module has no soft-delete tier.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { feedbackRequestService } from '../service';

/**
 * DELETE /feedback/:id (admin)
 * Permanently removes a feedback ticket. A malformed or unknown id both answer 404.
 */
export const deleteFeedback = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return Promise.resolve();

    return feedbackRequestService
        .remove(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAs(response, 'deleteFeedback'));
};
