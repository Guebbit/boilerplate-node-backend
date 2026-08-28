import type { Request, Response } from 'express';
import { readInput } from '@infrastructure/http/request';
import { paginationSchema } from '@infrastructure/http/schemas';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs, rejectValidation } from '@infrastructure/http/controller';

/**
 * GET /locales/:locale/entries (admin)
 * The rows behind one language's dictionary — what a translation screen lists.
 *
 * Flat and paginated, because a row is what gets edited. The nested tree a client consumes is
 * `GET /locales/:locale/messages`; one endpoint trying to be both is how this feature usually goes
 * wrong, so the two are named for what they are.
 *
 * Deliberately NOT cached. Every other locale read is, because they answer the same bytes to
 * everyone for an hour — this one is the screen a translator is typing into, where a stale page
 * means editing a value that has already changed. The saving would be a single indexed query
 * against a collection only admins can reach.
 */
export const getLocaleEntries = (
    request: Request<{ locale: string }, unknown, unknown, Record<string, string>>,
    response: Response
) => {
    // Query only — the `list` surface. The editing screen reaches this over a GET and there is
    // no `POST /locales/:locale/entries/search` to carry a body, so declaring one would claim a
    // source no client can send. See docs/theory/request-input.md.
    const { page, pageSize, text, tenant } = readInput(request, { surface: 'list' }) as Record<
        string,
        string | undefined
    >;

    // The shared schema is what makes `?pageSize=500` answer 422 here as it does everywhere else,
    // rather than being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    /*
     * `tenant` is handed over as the caller typed it. What an unrecognised one means is the
     * service's answer, not this file's — dropped on a read, refused on a write — and the two
     * halves of that policy are stated together in `services/languages.ts`. A check here would
     * have covered only this route, and left the reader of the write half with no sign that a
     * lenient sibling exists.
     */
    return localeService
        .searchEntries(request.params.locale, { ...parseResult.data, text, tenant })
        .then((result) =>
            result.success
                ? successResponse(response, result.data)
                : rejectResponse(response, result.status, result.errors)
        )
        .catch(catchAs(response, 'getLocaleEntries'));
};
