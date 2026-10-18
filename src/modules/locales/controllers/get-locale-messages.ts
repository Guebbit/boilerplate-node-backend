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
import { hasAnonymousReadScope } from '@kernel/access/query';

/**
 * GET /locales/:locale/messages
 * The client's dictionary for one language, built from the stored entries and served
 * nested to match GET /locales/:locale. Public and cacheable; every admin write
 * invalidates the `locales` tag, so an edit is visible on the next request. A caller whose read
 * scope differs from a stranger's (`display:Locale`) also gets inactive languages — the draft preview.
 */
export const getLocaleMessages = (
    request: Request<{ locale: string }, unknown, unknown, unknown>,
    response: Response
) => {
    // Parsed, not read: `?app=a&app=b` arrives as an array and `?app=` as an empty string,
    // and neither is an app. A blank value is refused (422) rather than read as "the default",
    // on purpose: omitting the parameter is how a client asks for the default.
    const query = parseBody(GetLocaleMessagesQueryParams, request.query, response);
    if (!query) return;

    return (
        localeService
            // `?app=` names which frontend's copy; omitted, the deployment's default one.
            .readMessages(
                request.params.locale,
                query.app,
                !hasAnonymousReadScope(localeService.callerScope, request.caller)
            )
            .then((result) => {
                if (refused(response, result)) return;
                return successResponse<LocaleMessages>(response, result.data);
            })
            .catch(catchAs(response, 'getLocaleMessages'))
    );
};
