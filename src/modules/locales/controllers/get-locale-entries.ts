import type { Request, Response } from 'express';
import { LocaleScope } from '@types';
import { readInput } from '@infrastructure/http/request';
import { paginationSchema } from '@infrastructure/http/schemas';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { localeService } from '../service';

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
    // Body first, then query — the search surface, same as every other list in this API, so
    // `?text=` and a JSON body reach one controller. See docs/theory/request-input.md.
    const { page, pageSize, text, scope } = readInput(request, { surface: 'search' }) as Record<
        string,
        string | undefined
    >;

    /*
     * An unrecognised `scope` is dropped rather than refused, which is the same answer `text=` and
     * every other optional filter gives: a listing narrowed by a value nothing matches would show
     * an empty screen and blame the data. Dropping it shows both dictionaries, which is what the
     * parameter defaults to anyway.
     */
    const scopeFilter = Object.values(LocaleScope).find((value) => value === scope);

    // The shared schema is what makes `?pageSize=500` answer 422 here as it does everywhere else,
    // rather than being silently clamped.
    const parseResult = paginationSchema.safeParse({ page, pageSize });
    if (!parseResult.success)
        return Promise.resolve(
            rejectResponse(
                response,
                422,
                parseResult.error.issues.map(({ message }) => message)
            )
        );

    return localeService
        .searchEntries(request.params.locale, { ...parseResult.data, text, scope: scopeFilter })
        .then((result) =>
            result.success
                ? successResponse(response, result.data)
                : rejectResponse(response, result.status, result.errors)
        )
        .catch((error: Error) => rejectDatabaseError(response, 'getLocaleEntries', error));
};
