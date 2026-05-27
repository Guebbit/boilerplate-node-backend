import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { CastError } from 'mongoose';
import type { SearchFeedbackRequestsRequest } from '@types';
import { extractRequestPagination } from '@utils/helpers-request';
import { rejectResponse, successResponse } from '@utils/response';
import { feedbackRequestService } from '@services/feedback-requests';

type FeedbackQuery = Partial<Record<keyof SearchFeedbackRequestsRequest, string>>;

export const getFeedback = (
    request: Request<ParamsDictionary, unknown, SearchFeedbackRequestsRequest, FeedbackQuery>,
    response: Response
) => {
    const { page, pageSize } = extractRequestPagination(request);

    const statusRaw = request.body?.status ?? request.query.status;
    // Pass as string — the service's toFeedbackStatus() handles the string→enum mapping
    const status = statusRaw ? String(statusRaw) : undefined;

    return feedbackRequestService
        .search({
            page,
            pageSize,
            text: request.body?.text ?? request.query.text,
            email: request.body?.email ?? request.query.email,
            status
        })
        .then((result) => successResponse(response, result))
        .catch((error: CastError) =>
            rejectResponse(response, 500, 'Internal Server Error', [error.message])
        );
};
