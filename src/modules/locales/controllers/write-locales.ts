/**
 * @module
 * POST /locales and PUT /locales/:locale (admin) controllers — register a language in the
 * dynamic tier, and edit the one thing about it that changes. Neither teaches the API to
 * answer in a language: `listSupportedLocales()` is read once per worker and i18next
 * registers its resources from it at boot, not per-request, so the negotiated locale and
 * the resolvable one can't disagree.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { CreateLocaleBody, UpdateLocaleBody } from '@api/schemas.zod';
import type { CreateLocaleRequest, UpdateLocaleRequest } from '@types';
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

            return successResponse(response, result.data, 201);
        })
        .catch(catchAs(response, 'createLocale'));
};

/**
 * PUT /locales/:locale (admin)
 * Edit a language's display names, direction or visibility. The tag is not editable —
 * every entry references it, so changing it would rename a whole dictionary.
 */
export const updateLocale = (
    request: Request<{ locale: string }, unknown, UpdateLocaleRequest>,
    response: Response
) => {
    const parseResult = UpdateLocaleBody.extend({
        name: displayName.optional(),
        nativeName: displayName.optional()
    }).safeParse(request.body);
    if (!parseResult.success) return Promise.resolve(rejectValidation(response, parseResult.error));

    return localeService
        .updateLanguage(request.params.locale, parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'updateLocale'));
};
