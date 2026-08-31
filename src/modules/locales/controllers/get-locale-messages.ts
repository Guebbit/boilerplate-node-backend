/**
 * @module
 * `GET /locales/:locale/messages` controller — thin HTTP adapter over `localeService.readMessages`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /locales/:locale/messages
 * The client's dictionary for one language, built from the stored entries and served
 * nested to match GET /locales/:locale. Public and cacheable; every admin write
 * invalidates the `locales` tag, so an edit is visible on the next request.
 */
export const getLocaleMessages = (
    request: Request<{ locale: string }, unknown, unknown, { tenant?: string }>,
    response: Response
) =>
    localeService
        // `?tenant=` names which frontend's copy; omitted, the deployment's default one.
        .readMessages(request.params.locale, request.query.tenant?.trim() || undefined)
        .then((result) =>
            result.success
                ? successResponse(response, result.data)
                : rejectResponse(response, result.status, result.errors)
        )
        .catch(catchAs(response, 'getLocaleMessages'));
