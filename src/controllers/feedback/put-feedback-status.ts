import type { Request, Response } from 'express';
import { z } from 'zod';
import { rejectResponse, successResponse } from '@utils/response';
import { UpdateFeedbackRequestStatusRequest } from '@types';
import { feedbackRequestService } from '@services/feedback-requests';

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
            return successResponse(response, result.data);
        });
};
