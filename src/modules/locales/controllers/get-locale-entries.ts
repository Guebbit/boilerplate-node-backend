/**
 * @module
 * `GET /locales/:locale/entries` controller — thin HTTP adapter over `localeService.searchEntries`.
 */

import type { Request, Response } from 'express';
import type { LocaleEntriesResponse, LocaleEntry } from '@types';
import { readInput } from '@infrastructure/http/request';
import { paginationSchema } from '@infrastructure/http/schemas';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs, rejectValidation } from '@infrastructure/http/controller';

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
    const { page, pageSize, text, tenant } = readInput(request, { surface: 'list' }) as Record<
        string,
        string | undefined
    >;

    // The shared schema is what makes `?pageSize=500` answer 422 here as it does everywhere else,
    // rather than being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    // `tenant` is passed through unchecked — what an unrecognised one means is the
    // service's call (dropped on read, refused on write); see services/languages.ts.
    return localeService
        .searchEntries(request.params.locale, { ...parseResult.data, text, tenant })
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.errors);
            // A success result for this endpoint always carries a page; this satisfies the type
            // checker without loosening it.
            if (!result.data) throw new Error('locale entry search succeeded without a page');
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
