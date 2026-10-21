/**
 * @module
 * Controller for `POST /locales` (admin) — register a language in the dynamic tier. The edit half
 * lives in `./update-locale.ts`, built on the shared PUT/PATCH factory; removal lives in
 * `./delete-locale.ts`.
 *
 * Registering a language switched on makes it servable at once: the request right after is
 * negotiated against the new list, product text and search follow, and the API's own messages fall
 * back to the default language until a dictionary file is deployed for it.
 */

import type { Request, Response } from 'express';
import { CreateLocaleBody } from '@api/schemas.zod';
import type { CreateLocaleRequest, Language } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { presentLocale } from '../presenters';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * POST /locales (admin)
 * Add a language.
 */
export const createLocale = (
    request: Request<Record<string, never>, unknown, CreateLocaleRequest>,
    response: Response
) => {
    const body = parseBody(
        CreateLocaleBody.extend({
            name: localeService.localeDisplayName,
            nativeName: localeService.localeDisplayName
        }),
        request.body,
        response
    );
    if (!body) return;

    return localeService
        .createLanguage(body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            const language = presentLocale(result.data);
            return createdResponse<Language>(response, language, `/locales/${language.tag}`);
        })
        .catch(catchAs(response, 'createLocale'));
};
