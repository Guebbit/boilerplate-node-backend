import type { Request, Response } from 'express';
import { z } from 'zod';
import { UpdateFeedbackRequestStatusBody } from '@api/schemas.zod';
import { rejectResponse, successResponse } from '@utils/response';
import type { UpdateFeedbackRequestStatusRequest } from '@types';
import { feedbackRequestService } from '@services/feedback-requests';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

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
    const parseResult = updateFeedbackStatusSchema.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            'Validation Error',
            parseResult.error.issues.map(({ message }) => message)
        );

    return feedbackRequestService
        .updateStatusById(request.params.id, parseResult.data)
        .then((result) => {
            if (!result.success)
                return rejectResponse(response, result.status, result.message, result.errors);
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.ADMIN_FEEDBACK_STATUS_UPDATED,
                    outcome: 'success',
                    target_type: 'feedback',
                    target_id: request.params.id,
                    metadata: { status: parseResult.data.status }
                })
            );
            return successResponse(response, result.data);
        });
};
