import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { CastError } from 'mongoose';
import type { SearchFeedbackRequestsRequest } from '@types';
import { extractRequestPagination } from '@utils/helpers-request';
import { rejectResponse, successResponse } from '@utils/response';
import { feedbackRequestService } from '@services/feedback-requests';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';

type FeedbackQuery = Partial<Record<keyof SearchFeedbackRequestsRequest, string>>;

/**
 * GET /feedback (admin)
 * Search and paginate feedback tickets by status, email, or text.
 */
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
        .then((result) => {
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.ADMIN_FEEDBACK_VIEWED,
                    outcome: 'success'
                })
            );
            return successResponse(response, result);
        })
        .catch((error: CastError) => rejectResponse(response, 500, 'getFeedback', [error.message]));
};
