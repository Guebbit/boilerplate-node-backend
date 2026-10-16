/**
 * @module
 * `GET /locales/:locale/entries` and `GET /locales/:locale/apps/:app/entries` controllers — thin HTTP adapter over `localeService.searchEntries`.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { LocaleEntriesResponse } from '@types';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListAppLocaleEntriesQueryParams, ListLocaleEntriesQueryParams } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * Relaxes a generated list query schema the way every list controller does: `page`/`pageSize`
 * swapped for the coercing infra pair, and `text` blank-to-undefined so `?text=` reads as "no
 * filter" rather than tripping the generated `.min(1)`. Both list routes take the same three
 * filters, so one builder serves both.
 *
 * @param generated - the operation's generated query schema
 * @returns the relaxed schema
 */
const relaxedQuery = (
    generated: typeof ListLocaleEntriesQueryParams | typeof ListAppLocaleEntriesQueryParams
) =>
    generated
        .extend({
            page: pageSchema,
            pageSize: pageSizeSchema,
            text: z.preprocess(blankToUndefined, generated.shape.text)
        })
        .partial();

/** The all-apps list's query; a stale `?app=` is a 422, since the schema is strict. */
const listLocaleEntriesQuerySchema = relaxedQuery(ListLocaleEntriesQueryParams);

/** The one-app list's query; the app comes from the path. */
const listAppLocaleEntriesQuerySchema = relaxedQuery(ListAppLocaleEntriesQueryParams);

/**
 * Lists one language's rows, optionally narrowed to an app — the one reader both routes share.
 *
 * @param request - the request; its query carries the filters
 * @param response - the express response
 * @param schema - the route's own query schema
 * @param app - the app the path names, when it names one
 */
const listEntries = (
    request: Request<{ locale: string }, unknown, unknown, Record<string, string>>,
    response: Response,
    schema: typeof listLocaleEntriesQuerySchema,
    app?: string
) => {
    // Query params only — a GET has no body to carry a search payload.
    // See docs/theory/request-input.md.
    const parsed = parseBody(schema, readInput(request, { surface: 'list' }), response);
    if (!parsed) return Promise.resolve();

    return localeService
        .searchEntries(request.params.locale, app === undefined ? parsed : { ...parsed, app })
        .then((result) => {
            if (refused(response, result)) return;
            // `search()`'s `TWire` is `LocaleEntry` itself, so `result.data.items` is already the
            // wire shape this response needs — no cast.
            return successResponse<LocaleEntriesResponse>(response, result.data);
        })
        .catch(catchAs(response, 'getLocaleEntries'));
};

/**
 * GET /locales/:locale/entries (admin)
 * Flat, paginated rows for one language's dictionary — every app's. What a translation screen
 * edits. The nested tree a client consumes is served separately by GET /locales/:locale/messages.
 * Deliberately not cached: this is the screen a translator is actively typing into.
 */
export const getLocaleEntries = (
    request: Request<{ locale: string }, unknown, unknown, Record<string, string>>,
    response: Response
) => listEntries(request, response, listLocaleEntriesQuerySchema);

/**
 * GET /locales/:locale/apps/:app/entries (admin)
 * One app's slice of the language, at the address the writes target, so a PUT there replaces
 * exactly what this lists.
 */
export const getAppLocaleEntries = (
    request: Request<{ locale: string; app: string }, unknown, unknown, Record<string, string>>,
    response: Response
) => listEntries(request, response, listAppLocaleEntriesQuerySchema, request.params.app);
