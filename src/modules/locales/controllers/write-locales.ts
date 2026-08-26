import type { Request, Response } from 'express';
import { z } from 'zod';
import { CreateLocaleBody, UpdateLocaleBody } from '@api/schemas.zod';
import type { CreateLocaleRequest, UpdateLocaleRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /locales and PUT /locales/:locale (admin)
 * Register a language in the dynamic tier, and edit the one thing about it that changes.
 *
 * Neither of these teaches the API to answer in a language. `listSupportedLocales()` is read once
 * per worker and i18next registers its resources from it at boot — deliberately, because a
 * per-request directory read would let the negotiated locale and the resolvable one disagree, and
 * a `Content-Language` header that lies is worse than a language being unavailable. A row written
 * here is `app`-scoped until a file is deployed for it, and the manifest says so.
 */

/**
 * A display name that survives being trimmed.
 *
 * `openapi.yaml` says `minLength: 1`, which a single space satisfies — and both the schema here and
 * Mongoose then trim, so `" "` arrives as `""` at a column declared `required: true`.
 *
 * Trimming BEFORE the length check is what makes the refusal the request's own, answered by the
 * schema that declared the rule rather than by the database rejecting the write. `minLength` in
 * the contract cannot express it — JSON Schema has no trim — so the constraint lives here, the way
 * `feedback`'s `adminNotes` cap does. The error names the field; a `ValidationError` surfacing
 * from Mongoose is a 422 too (`@infrastructure/http/errors`) but says only that something was
 * invalid.
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
 * Edit a language's display names, direction or visibility.
 *
 * The tag is not editable, which is why it is not in the body schema: every entry references it,
 * so changing it would rename a whole dictionary rather than edit this record.
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
