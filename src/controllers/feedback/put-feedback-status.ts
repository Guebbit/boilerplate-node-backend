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
        .updateStatusById(request.params.id, parseResult.data)
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.message, result.errors);
            emitAuditEvent({
                action: AuditAction.ADMIN_FEEDBACK_STATUS_UPDATED,
                actor_user_id: request.authContext?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'feedback',
                target_id: request.params.id,
                ...extractRequestContext(request),
                metadata: { status: parseResult.data.status }
            });
            return successResponse(response, result.data);
        });
};
