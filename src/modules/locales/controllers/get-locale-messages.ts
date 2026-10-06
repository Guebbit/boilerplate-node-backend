/**
 * @module
 * `GET /locales/:locale/messages` controller — thin HTTP adapter over `localeService.readMessages`.
 */

import type { Request, Response } from 'express';
import type { LocaleMessages } from '@types';
import { GetLocaleMessagesQueryParams } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * GET /locales/:locale/messages
 * The client's dictionary for one language, built from the stored entries and served
 * nested to match GET /locales/:locale. Public and cacheable; every admin write
 * invalidates the `locales` tag, so an edit is visible on the next request.
 */
export const getLocaleMessages = (
    request: Request<{ locale: string }, unknown, unknown, unknown>,
    response: Response
) => {
    // Parsed, not read: `?tenant=a&tenant=b` arrives as an array and `?tenant=` as an empty string,
    // and neither is a tenant. A blank value is refused (422) rather than read as "the default",
    // on purpose: omitting the parameter is how a client asks for the default.
    const query = parseBody(GetLocaleMessagesQueryParams, request.query, response);
    if (!query) return;

    return (
        localeService
            // `?tenant=` names which frontend's copy; omitted, the deployment's default one.
            .readMessages(request.params.locale, query.tenant)
            .then((result) => {
                if (refused(response, result)) return;
                return successResponse<LocaleMessages>(response, result.data);
            })
            .catch(catchAs(response, 'getLocaleMessages'))
    );
};
