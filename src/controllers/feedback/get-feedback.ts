import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import type { SearchFeedbackRequestsRequest } from '@types';
import { extractPagination } from '@utils/helpers-request';
import { rejectResponse, successResponse } from '@utils/response';
import { feedbackRequestService } from '@services/feedback-requests';

type FeedbackQuery = Partial<Record<keyof SearchFeedbackRequestsRequest, string>>;
const FEEDBACK_STATUSES = new Set(['new', 'in_progress', 'resolved', 'spam']);

export const getFeedback = (
    request: Request<unknown, unknown, SearchFeedbackRequestsRequest, FeedbackQuery>,
    response: Response
) => {
    const { page, pageSize } = extractPagination({
        page: request.body?.page ?? request.query.page,
        pageSize: request.body?.pageSize ?? request.query.pageSize
    });

    const statusRaw = request.body?.status ?? request.query.status;
    const status =
        statusRaw && FEEDBACK_STATUSES.has(String(statusRaw))
            ? (String(statusRaw) as unknown as SearchFeedbackRequestsRequest['status'])
            : undefined;

    return feedbackRequestService
        .search({
            page,
            pageSize,
            text: request.body?.text ?? request.query.text,
            email: request.body?.email ?? request.query.email,
            status
        })
        .then((result) => successResponse(response, result))
        .catch((error: CastError) => rejectResponse(response, 500, 'Unknown Error', [error.message]));
};
