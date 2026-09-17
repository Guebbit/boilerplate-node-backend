/**
 * @module
 * `PATCH /locales/translations/:entityType/:id` controller — thin HTTP adapter over
 * `localeService.upsertEntityTranslations`.
 */

import type { Request, Response } from 'express';
import { UpsertEntityTranslationsBody } from '@api/schemas.zod';
import type { UpsertTranslationsRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { localeService } from '../services';

/**
 * PATCH /locales/translations/:entityType/:id (admin)
 * Merges the body into the entity's translations — an object upserts a locale, `null` deletes it,
 * an absent key leaves it alone. See `openapi.yaml` for the full three-way table.
 *
 * No `<EntityTranslations>` on `successResponse` — see `get-entity-translations.ts`'s docblock for
 * why: the rows are already the wire shape by the time they get here.
 */
export const upsertEntityTranslations = (
    request: Request<{ entityType: string; id: string }, unknown, UpsertTranslationsRequest>,
    response: Response
) => {
    const body = parseBody(UpsertEntityTranslationsBody, request.body, response);
    if (!body) return;

    return localeService
        .upsertEntityTranslations(
            request.params.entityType,
            request.params.id,
            body,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            // A success result for this endpoint always carries the shape below; this satisfies
            // the type checker without loosening it.
            if (!result.data) throw new Error('entity translations write succeeded without data');

            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'upsertEntityTranslations'));
};
