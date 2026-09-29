/**
 * @module
 * Controller for `POST /locales` (admin) — register a language in the dynamic tier. The edit half
 * lives in `./update-locale.ts`, built on the shared PUT/PATCH factory; removal lives in
 * `./delete-locale.ts`.
 *
 * Registering a language does not teach the API to answer in it: `listSupportedLocales()` is read
 * once per worker and i18next registers its resources from it at boot, not per-request, so the
 * negotiated locale and the resolvable one can't disagree.
 */

import type { Request, Response } from 'express';
import { CreateLocaleBody } from '@api/schemas.zod';
import type { CreateLocaleRequest, Language } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { presentLocale } from '../presenters';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /locales (admin)
 * Add a language.
 */
export const createLocale = (
    request: Request<Record<string, never>, unknown, CreateLocaleRequest>,
    response: Response
) => {
    const parseResult = CreateLocaleBody.extend({
        name: localeService.localeDisplayName,
        nativeName: localeService.localeDisplayName
    }).safeParse(request.body);
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    return localeService
        .createLanguage(parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            const language = presentLocale(result.data);
            return createdResponse<Language>(response, language, `/locales/${language.tag}`);
        })
        .catch(catchAs(response, 'createLocale'));
};
