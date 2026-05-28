import type { Request, Response } from 'express';
import { z } from 'zod';
import { rejectResponse, successResponse } from '@utils/response';
import { UpdateFeedbackRequestStatusRequest } from '@types';
import { feedbackRequestService } from '@services/feedback-requests';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

const updateFeedbackStatusSchema = z.object({
    status: z.nativeEnum(UpdateFeedbackRequestStatusRequest.status).optional(),
    adminNotes: z.string().max(5000).optional()
});

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
        .updateStatus(request.params.id, parseResult.data)
        .then((feedbackRequest) => {
            emitAuditEvent({
                action: AuditAction.ADMIN_FEEDBACK_STATUS_UPDATED,
                actor_user_id: request.user?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'feedback',
                target_id: request.params.id,
                ...extractRequestContext(request),
                metadata: { status: parseResult.data.status }
            });
            return successResponse(response, feedbackRequest);
        })
        .catch((error: Error) => {
            if (error.message === '404') return rejectResponse(response, 404, 'Not Found');
            return rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
