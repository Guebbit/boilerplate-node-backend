/**
 * @module
 * `PUT` and `PATCH /locales/translations/:entityType/:id` — thin HTTP adapters over
 * `localeService.replaceEntityTranslations`/`upsertEntityTranslations`. PUT replaces (a stored
 * locale the body doesn't name is deleted), PATCH merges (an absent locale is left alone) — the
 * same replace/merge split `write-locale-entries.ts` already uses for its own bulk import pair.
 */

import type { Request, Response } from 'express';
import { ReplaceEntityTranslationsBody, UpsertEntityTranslationsBody } from '@api/schemas.zod';
import type { CallerContext, MergeTranslationsRequest, UpsertTranslationsRequest } from '@types';
import type { ZodType } from 'zod';
import {
    successResponse,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { localeService } from '../services';
import type { EntityTranslationsResult } from '../services/translations';

/**
 * The two routes differ by their schema and their service call, so one builder makes both.
 *
 * @param schema - the operation's generated body schema
 * @param write - the service call that applies a body of that shape
 * @param operation - the name a failure is logged under
 * @returns the express handler
 */
const writeEntityTranslations =
    <TSchema extends ZodType>(
        schema: TSchema,
        write: (
            entityType: string,
            entityId: string,
            body: TSchema['_output'],
            context: CallerContext
        ) => Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject>,
        operation: string
    ) =>
    (
        request: Request<
            { entityType: string; id: string },
            unknown,
            UpsertTranslationsRequest | MergeTranslationsRequest
        >,
        response: Response
    ) => {
        const body = parseBody(schema, request.body, response);
        if (!body) return;

        return write(request.params.entityType, request.params.id, body, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;

                return successResponse(response, result.data);
            })
            .catch(catchAs(response, operation));
    };

/**
 * PUT /locales/translations/:entityType/:id (admin)
 * Replace the whole set — a locale stored and not sent is deleted, and a field a sent locale
 * leaves out is cleared. See `openapi.yaml` for the full table.
 */
export const replaceEntityTranslations = writeEntityTranslations(
    ReplaceEntityTranslationsBody,
    localeService.replaceEntityTranslations,
    'replaceEntityTranslations'
);

/**
 * PATCH /locales/translations/:entityType/:id (admin)
 * Merges the body into the entity's translations (RFC 7396) — an object merges into a locale
 * field by field, `null` deletes it, an absent key leaves it alone. See `openapi.yaml` for the
 * full table.
 *
 * No `<EntityTranslations>` on `successResponse` — see `get-entity-translations.ts`'s docblock for
 * why: the rows are already the wire shape by the time they get here.
 */
export const upsertEntityTranslations = writeEntityTranslations(
    UpsertEntityTranslationsBody,
    localeService.upsertEntityTranslations,
    'upsertEntityTranslations'
);
