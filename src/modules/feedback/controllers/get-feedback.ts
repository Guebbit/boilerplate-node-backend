/**
 * @module
 * Controller for `GET /feedback` and `POST /feedback/search` — the admin triage queue in its
 * cacheable query and DTO body spellings, built on the same factory `products`, `users` and
 * `orders` share. See docs/modules/feedback.md.
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
 * Query parameters that change this endpoint's answer, and therefore its cache key. Derived from
 * the schema rather than hand-listed: a parameter the controller reads but the key omits would let
 * two different searches share one cached response.
 */
export const searchFeedbackKeyParameters = Object.keys(searchFeedbackQuerySchema.shape);

/**
 * GET /feedback and POST /feedback/search (admin)
 * Search and paginate feedback tickets by status, email, or text — the query form is cacheable,
 * the body form carries filters too broad for a URL.
 */
export const getFeedback = createSearchController({
    entity: 'feedback',
    schema: searchFeedbackQuerySchema,
    runSearch: (parsed, request): Promise<FeedbackRequestsResponse> =>
        feedbackRequestService.search(parsed, callerContextOf(request))
});
