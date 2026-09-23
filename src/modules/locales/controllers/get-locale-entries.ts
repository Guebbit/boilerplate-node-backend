/**
 * @module
 * `GET /locales/:locale/entries` controller — thin HTTP adapter over `localeService.searchEntries`.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { LocaleEntriesResponse, LocaleEntry } from '@types';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListLocaleEntriesQueryParams } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * The generated query schema, relaxed the way every list controller relaxes it: `page`/`pageSize`
 * swapped for the coercing infra pair, and `text` blank-to-undefined so `?text=` reads as "no
 * filter" rather than tripping the generated `.min(1)`. A malformed `tenant` (outside
 * `^[a-z0-9][a-z0-9-]*$`) still 422s here; an unrecognised-but-well-formed one reaches the
 * repository unchanged and simply matches no row — see `searchEntries`.
 */
const listLocaleEntriesQuerySchema = ListLocaleEntriesQueryParams.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    text: z.preprocess(blankToUndefined, ListLocaleEntriesQueryParams.shape.text)
}).partial();

/**
 * GET /locales/:locale/entries (admin)
 * Flat, paginated rows for one language's dictionary — what a translation screen edits.
 * The nested tree a client consumes is served separately by GET /locales/:locale/messages.
 * Deliberately not cached: this is the screen a translator is actively typing into.
 */
export const getLocaleEntries = (
    request: Request<{ locale: string }, unknown, unknown, Record<string, string>>,
    response: Response
) => {
    // Query params only — a GET has no body to carry a search payload.
    // See docs/theory/request-input.md.
    const parsed = parseBody(
        listLocaleEntriesQuerySchema,
        readInput(request, { surface: 'list' }),
        response
    );
    if (!parsed) return Promise.resolve();

    return localeService
        .searchEntries(request.params.locale, parsed)
        .then((result) => {
            if (refused(response, result)) return;
            // `search()` already returns normalized (wire-shape) rows — unlike `findById`/`findOne`,
            // it never hands back a hydrated document, so there is no `.toJSON()` to apply here.
            // The repository factory's `PaginatedResult<TDocument>` names the pre-normalize type,
            // which is why `items` needs the cast below.
            const items: unknown = result.data.items;
            return successResponse<LocaleEntriesResponse>(response, {
                items: items as LocaleEntry[],
                meta: result.data.meta
            });
        })
        .catch(catchAs(response, 'getLocaleEntries'));
};
