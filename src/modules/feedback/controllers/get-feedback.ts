/**
 * @module
 * Controller for `GET /feedback` and `POST /feedback/search` — the admin triage queue, in its two
 * cacheable/DTO spellings. See the JSDoc on `getFeedback` below for the query/body split and
 * `searchFeedbackKeyParameters` for why the cache key is hand-listed.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { SearchFeedbackRequestsRequest } from '@types';
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
 * Hand-listed rather than derived, because this controller validates only its pagination — the
 * remaining filters are free text it forwards to the service. It must stay in step with what
 * `getFeedback` destructures below: a parameter read here but missing from the key would let two
 * different searches share one cached response.
 *
 * Only the QUERY form is keyable, which is why `GET /feedback` declares no body and the DTO form
 * is `POST /feedback/search` — an uncached route. A filter that arrived in a body could not reach
 * this list, so it would have been invisible to the key and two different searches would have
 * shared an entry for the cache's whole lifetime.
 */
export const searchFeedbackKeyParameters = ['page', 'pageSize', 'text', 'email', 'status'];

/**
 * GET /feedback and POST /feedback/search (admin)
 * Search and paginate feedback tickets by status, email, or text.
 *
 * One controller, two spellings — the same pairing products, users and orders each have. The
 * query form is the cacheable one; the body form is what carries a filter set that does not
 * belong in a URL.
 */
export const getFeedback = (
    request: Request<ParamsDictionary, unknown, SearchFeedbackRequestsRequest, FeedbackQuery>,
    response: Response
) => {
    // Filters arrive from either transport, body first — see docs/theory/request-input.md. The
    // cast is the same assertion the `Request` generics above already make: nothing has validated
    // these yet, which is why `status` is still re-checked below.
    const { page, pageSize, text, email, status } = readInput(request, {
        surface: 'search'
    }) as FeedbackQuery;

    // Only the pagination is validated here — the other filters are free-text and unconstrained.
    // The shared schema is what makes `?pageSize=500` answer 422 here as it does everywhere else,
    // rather than being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    return feedbackRequestService
        .search(
            {
                ...parseResult.data,
                text,
                email,
                // Pass as string — the service's toFeedbackStatus() handles the string→enum mapping.
                // An invalid one is not a 422 here: on a READ it narrows to nothing. See that helper.
                status: status || undefined
            },
            callerContextOf(request)
        )
        .then((result) => successResponse(response, result))
        .catch(catchAs(response, 'getFeedback'));
};
