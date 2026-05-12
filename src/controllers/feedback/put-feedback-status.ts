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
        .updateStatus(request.params.id, parseResult.data)
        .then((feedbackRequest) => successResponse(response, feedbackRequest.toObject()))
        .catch((error: Error) => {
            if (error.message === '404') return rejectResponse(response, 404, 'Not Found');
            return rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
