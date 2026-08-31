/**
 * @module
 * Controller for `PUT /feedback/:id` — admin triage: status transitions and notes.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { UpdateFeedbackRequestStatusBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { UpdateFeedbackRequestStatusRequest } from '@types';
import { feedbackRequestService } from '../service';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * Built on the orval-generated UpdateFeedbackRequestStatusBody (kept in sync
 * with openapi.yaml); adminNotes gets a length cap not expressed in the
 * OpenAPI schema.
 */
const updateFeedbackStatusSchema = UpdateFeedbackRequestStatusBody.extend({
    adminNotes: z.string().max(5000).optional()
});

/**
 * PUT /feedback/:id (admin)
 * Update the status and/or admin notes on a feedback ticket.
 */
export const putFeedbackStatus = (
    request: Request<{ id: string }, unknown, UpdateFeedbackRequestStatusRequest>,
    response: Response
) => {
    // DISPOSITION — a value outside the closed set. This is the WRITE half: the generated enum
    // rejects it with a 422. The READ half narrows to nothing instead — see `toFeedbackStatus`.
    const body = parseBody(updateFeedbackStatusSchema, request.body, response);
    if (!body) return;

    return feedbackRequestService
        .updateStatusById(request.params.id, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'putFeedbackStatus'));
};
