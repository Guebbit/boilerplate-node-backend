/**
 * @module
 * `POST /locales/:locale/apps/:app/entries` — add one key to an app's dictionary.
 */

import type { Request, Response } from 'express';
import { CreateLocaleEntryBody } from '@api/schemas.zod';
import type { CreateLocaleEntryRequest, LocaleEntry } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { trimmedInto } from '@infrastructure/http/schemas';
import { localeService } from '../services';
import { presentLocaleEntry } from '../presenters';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/** The create body with `key` trimmed first, so a blank key is a field-level 422. */
const createTrimmedEntryBody = CreateLocaleEntryBody.extend({
    key: trimmedInto(CreateLocaleEntryBody.shape.key)
});

/**
 * POST /locales/:locale/apps/:app/entries (admin)
 * Add one key to the app's dictionary.
 */
export const createLocaleEntry = (
    request: Request<{ locale: string; app: string }, unknown, CreateLocaleEntryRequest>,
    response: Response
) => {
    const body = parseBody(createTrimmedEntryBody, request.body, response);
    if (!body) return;

    return localeService
        .createEntry(request.params.locale, request.params.app, body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            const entry = presentLocaleEntry(result.data);
            return createdResponse<LocaleEntry>(
                response,
                entry,
                `/locales/${request.params.locale}/apps/${request.params.app}/entries/${entry.id}`
            );
        })
        .catch(catchAs(response, 'createLocaleEntry'));
};
