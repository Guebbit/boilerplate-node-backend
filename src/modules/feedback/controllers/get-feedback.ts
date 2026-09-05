/**
 * @module
 * Controller for `GET /feedback` and `POST /feedback/search` — the admin triage queue in its
 * cacheable query and DTO body spellings. See `searchFeedbackKeyParameters` below for why the
 * cache key is hand-listed. See docs/modules/feedback.md.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type {
    FeedbackRequest,
    FeedbackRequestsResponse,
    SearchFeedbackRequestsRequest
} from '@types';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { paginationSchema } from '@infrastructure/http/schemas';
import { successResponse } from '@infrastructure/http/response';
import { feedbackRequestService } from '../service';
import { catchAs, rejectValidation } from '@infrastructure/http/controller';

/** The filters this endpoint accepts, all as raw query-string values. */
type FeedbackQuery = Partial<Record<keyof SearchFeedbackRequestsRequest, string>>;

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 *
 * Hand-listed, not derived — this controller validates only pagination, forwarding the rest as
 * free text. Must stay in sync with what `getFeedback` destructures below: a filter missing here
 * would let two different searches share one cached response.
 */
export const searchFeedbackKeyParameters = ['page', 'pageSize', 'text', 'email', 'status'];

/**
 * GET /feedback and POST /feedback/search (admin)
 * Search and paginate feedback tickets by status, email, or text — the query form is cacheable,
 * the body form carries filters too broad for a URL.
 */
export const getFeedback = (
    request: Request<ParamsDictionary, unknown, SearchFeedbackRequestsRequest, FeedbackQuery>,
    response: Response
) => {
    // Filters arrive from either transport, body first — see docs/theory/request-input.md.
    // Nothing here is validated yet, which is why `status` is re-checked below.
    const { page, pageSize, text, email, status } = readInput(request, {
        surface: 'search'
    }) as FeedbackQuery;

    // Only pagination is validated here; other filters are free text. The shared schema is what
    // makes `?pageSize=500` answer 422 here as everywhere else, instead of being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    return feedbackRequestService
        .search(
            {
                ...parseResult.data,
                text,
                email,
                // Passed as a string — toFeedbackStatus() maps it; an invalid value narrows the
                // READ to nothing rather than 422ing, unlike the WRITE path. See that helper.
                status: status || undefined
            },
            callerContextOf(request)
        )
        .then((result) => {
            // `search()` already returns normalized (wire-shape) rows — unlike `findById`/`findOne`,
            // it never hands back a hydrated document, so there is no `.toJSON()` to apply here.
            // The repository factory's `PaginatedResult<TDocument>` names the pre-normalize type,
            // which is why `items` needs the cast below.
            const items: unknown = result.items;
            return successResponse<FeedbackRequestsResponse>(response, {
                items: items as FeedbackRequest[],
                meta: result.meta
            });
        })
        .catch(catchAs(response, 'getFeedback'));
};
