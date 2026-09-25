/**
 * @module
 * Controller for `GET /feedback` and `POST /feedback/search` — the admin triage queue in its
 * query and DTO body spellings, built on the shared search-controller factory. Never
 * Redis-cached: the answer is one admin's queue, not a shared shop-wide answer.
 * See docs/modules/feedback.md.
 */

import type { FeedbackRequestsResponse } from '@types';
import { SearchFeedbackRequestsBody } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { callerContextOf } from '@infrastructure/http/request';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { feedbackRequestService } from '../service';

/**
 * Extends the orval-generated `SearchFeedbackRequestsBody`; `page`/`pageSize` are coerced from
 * strings since the GET form carries them as query text, not JSON types.
 */
const searchFeedbackQuerySchema = SearchFeedbackRequestsBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/**
 * GET /feedback and POST /feedback/search (admin)
 * Search and paginate feedback tickets by status, email, or text.
 */
export const getFeedback = createSearchController({
    entity: 'feedback',
    schema: searchFeedbackQuerySchema,
    runSearch: (parsed, request): Promise<FeedbackRequestsResponse> =>
        feedbackRequestService.search(parsed, callerContextOf(request))
});
