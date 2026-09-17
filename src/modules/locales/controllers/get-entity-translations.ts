/**
 * @module
 * `GET /locales/translations/:entityType/:id` controller — thin HTTP adapter over
 * `localeService.getEntityTranslations`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { localeService } from '../services';

/**
 * GET /locales/translations/:entityType/:id (admin)
 * Every locale this entity has a row for, in one response.
 *
 * No `<EntityTranslations>` on `successResponse`: `translationRepository.normalize` already
 * applied the model's `_id` → `id` / date-to-ISO-string transform to a lean result before this
 * runs, the same trust `orders/repository.ts`'s `search` extends to its own callers — the array
 * is typed as the document only because `Repository.normalize`'s signature is shared, not because
 * that is what it returns.
 */
export const getEntityTranslations = (
    request: Request<{ entityType: string; id: string }>,
    response: Response
) =>
    localeService
        .getEntityTranslations(request.params.entityType, request.params.id)
        .then((result) => {
            if (refused(response, result)) return;

            // A success result for this endpoint always carries the shape below; this satisfies
            // the type checker without loosening it.
            if (!result.data) throw new Error('entity translations read succeeded without data');

            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'getEntityTranslations'));
