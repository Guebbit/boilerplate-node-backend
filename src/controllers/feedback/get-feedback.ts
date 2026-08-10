import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { CastError } from 'mongoose';
import type { SearchFeedbackRequestsRequest } from '@types';
import { readInput } from '@core/http/request';
import { paginationSchema } from '@core/http/schemas';
import { rejectResponse, successResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import { feedbackRequestService } from '@services/feedback-requests';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

type FeedbackQuery = Partial<Record<keyof SearchFeedbackRequestsRequest, string>>;

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 *
 * Hand-listed rather than derived, because this controller validates only its pagination — the
 * remaining filters are free text it forwards to the service. It must stay in step with what
 * `getFeedback` destructures below: a parameter read here but missing from the key would let two
 * different searches share one cached response.
 */
export const searchFeedbackKeyParameters = ['page', 'pageSize', 'text', 'email', 'status'];

/**
 * GET /feedback (admin)
 * Search and paginate feedback tickets by status, email, or text.
 */
export const getFeedback = (
    request: Request<ParamsDictionary, unknown, SearchFeedbackRequestsRequest, FeedbackQuery>,
    response: Response
) => {
    // Filters arrive from either transport, body first — see docs/theory/request-input.md. The
    // cast is the same assertion the `Request` generics above already make: nothing has validated
    // these yet, which is why `status` is still re-checked below.
    const { page, pageSize, text, email, status } = readInput(request, {
        sources: ['body', 'query']
    }) as FeedbackQuery;

    // Only the pagination is validated here — the other filters are free-text and unconstrained.
    // The shared schema is what makes `?pageSize=500` answer 422 here as it does everywhere else,
    // rather than being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success)
        return Promise.resolve(
            rejectResponse(
                response,
                422,
                'getFeedback - invalid data',
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return feedbackRequestService
        .search({
            ...parseResult.data,
            text,
            email,
            // Pass as string — the service's toFeedbackStatus() handles the string→enum mapping
            status: status ? String(status) : undefined
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
        .catch((error: CastError) => rejectDatabaseError(response, 'getFeedback', error));
};
