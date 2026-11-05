/**
 * @module
 * `PUT /locales/:locale/apps/:app/entries/:entryId` — edit one entry's value. The app is a path
 * segment, so a PUT replaces exactly what the GET on the same URI lists.
 */

import type { Request, Response } from 'express';
import { ReplaceLocaleEntryBody } from '@api/schemas.zod';
import type { LocaleEntry, ReplaceLocaleEntryRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { localeService } from '../services';
import { presentLocaleEntry } from '../presenters';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * PUT /locales/:locale/apps/:app/entries/:entryId (admin)
 * Edit one value. The key is not editable — it's the identity a client looks the string
 * up by, so changing it is a delete plus an add, not an update.
 */
export const replaceLocaleEntry = (
    request: Request<
        { locale: string; app: string; entryId: string },
        unknown,
        ReplaceLocaleEntryRequest
    >,
    response: Response
) => {
    const entryId = requireId(request, response, {
        notFound: 'locales.error-entry-not-found',
        name: 'entryId'
    });
    if (!entryId) return;

    const body = parseBody(ReplaceLocaleEntryBody, request.body, response);
    if (!body) return;

    return localeService
        .updateEntry(
            request.params.locale,
            request.params.app,
            entryId,
            body,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse<LocaleEntry>(response, presentLocaleEntry(result.data));
        })
        .catch(catchAs(response, 'replaceLocaleEntry'));
};
