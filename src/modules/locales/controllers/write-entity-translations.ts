/**
 * @module
 * `PUT` and `PATCH /locales/translations/:entityType/:id` — thin HTTP adapters over
 * `localeService.replaceEntityTranslations`/`upsertEntityTranslations`. PUT replaces (a stored
 * locale the body doesn't name is deleted), PATCH merges (an absent locale is left alone) — the
 * same replace/merge split `write-locale-entries.ts` already uses for its own bulk import pair.
 */

import type { Request, Response } from 'express';
import { ReplaceEntityTranslationsBody, UpsertEntityTranslationsBody } from '@api/schemas.zod';
import type { UpsertTranslationsRequest } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { localeService } from '../services';

/**
 * PUT /locales/translations/:entityType/:id (admin)
 * Replace the whole set — a locale stored and not sent is deleted. See `openapi.yaml` for the
 * full table, and why a translations table isn't a "whole-body replace" field on the entity
 * itself.
 */
export const replaceEntityTranslations = (
    request: Request<{ entityType: string; id: string }, unknown, UpsertTranslationsRequest>,
    response: Response
) => {
    const body = parseBody(ReplaceEntityTranslationsBody, request.body, response);
    if (!body) return;

    return localeService
        .replaceEntityTranslations(
            request.params.entityType,
            request.params.id,
            body,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'replaceEntityTranslations'));
};

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

            return successResponse(response, result.data);
        })
        .catch(catchAs(response, 'upsertEntityTranslations'));
};
