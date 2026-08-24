import type { Request, Response } from 'express';
import { z } from 'zod';
import { UpdateFeedbackRequestStatusBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { UpdateFeedbackRequestStatusRequest } from '@types';
import { feedbackRequestService } from '../service';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { feedbackAuditActions } from '../audit';
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
        .updateStatusById(request.params.id, body)
        .then((result) => {
            if (refused(response, result)) return;
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: feedbackAuditActions.ADMIN_FEEDBACK_STATUS_UPDATED,
                    outcome: 'success',
                    target_type: 'feedback',
                    target_id: request.params.id,
                    metadata: { status: body.status }
                })
            );
            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'putFeedbackStatus'));
};
