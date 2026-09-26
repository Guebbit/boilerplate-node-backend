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
import { z } from 'zod';
import { CreateLocaleBody } from '@api/schemas.zod';
import type { CreateLocaleRequest, Language } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * A display name that survives being trimmed.
 * `minLength: 1` in `openapi.yaml` accepts a single space, which Mongoose then trims to
 * `""` at a `required: true` column. Trimming before the length check here catches that
 * at validation, with a field-named error, instead of as a generic Mongoose 422.
 */
const displayName = z.string().trim().min(1);

/**
 * POST /locales (admin)
 * Add a language.
 */
export const createLocale = (
    request: Request<Record<string, never>, unknown, CreateLocaleRequest>,
    response: Response
) => {
    const parseResult = CreateLocaleBody.extend({
        name: displayName,
        nativeName: displayName
    }).safeParse(request.body);
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    return localeService
        .createLanguage(parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the
            // document is typed as stored, not as the wire shape `Language` promises.
            return successResponse<Language>(response, result.data.toJSON() as Language, 201);
        })
        .catch(catchAs(response, 'createLocale'));
};
