import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { localeService } from '../service';

/**
 * GET /locales/:locale/messages
 * The CLIENT's dictionary for one language, built from the stored entries.
 *
 * This is the endpoint the whole module exists for. A frontend bundles the languages it knew about
 * when it was built and lazy-loads them with a dynamic import; that covers nothing added since. So
 * its resolution order becomes: its own bundle first, this endpoint for a language it does not
 * ship, its bundled fallback when neither answers.
 *
 * Served NESTED rather than flat, matching `GET /locales/:locale`, so a client has one merge path
 * for both tiers instead of two. The rows stay flat in the database because that is what makes
 * them editable one at a time.
 *
 * Public and cacheable, on the same reasoning as every other locale read: no user data, identical
 * for every caller, and needed most by a client that has just failed to authenticate. Every admin
 * write invalidates the `locales` tag, so an edit is visible on the next request rather than in an
 * hour.
 */
export const getLocaleMessages = (request: Request<{ locale: string }>, response: Response) =>
    localeService
        .readMessages(request.params.locale)
        .then((result) =>
            result.success
                ? successResponse(response, result.data)
                : rejectResponse(response, result.status, result.errors)
        )
        .catch((error: Error) => rejectDatabaseError(response, 'getLocaleMessages', error));
