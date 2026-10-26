/**
 * @module
 * Controller for `GET /tickets` and `POST /tickets/search` — the admin triage queue in its
 * query and DTO body spellings, built on the shared search-controller factory. Never
 * Redis-cached: the answer is one admin's queue, not a shared shop-wide answer.
 * See docs/modules/tickets.md.
 */

import type { TicketsResponse } from '@types';
import { SearchTicketsBody } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { callerContextOf } from '@infrastructure/http/request';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { ticketService } from '../service';

/**
 * Extends the orval-generated `SearchTicketsBody`; `page`/`pageSize` are coerced from
 * strings since the GET form carries them as query text, not JSON types.
 */
const searchTicketsQuerySchema = SearchTicketsBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/**
 * GET /tickets and POST /tickets/search (admin)
 * Search and paginate tickets by status, email, or text.
 */
export const getTickets = createSearchController({
    entity: 'tickets',
    schema: searchTicketsQuerySchema,
    runSearch: (parsed, request): Promise<TicketsResponse> =>
        ticketService.search(parsed, callerContextOf(request))
});
