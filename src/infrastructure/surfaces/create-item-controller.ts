/**
 * @module
 * The read-one controller: fetch by path id, 404 with the module's own key when nothing comes
 * back, the SAME 404 when Mongoose rejects the id as a CastError, `rejectDatabaseError` for
 * anything else. Shared rather than left inline because "a malformed id is a 404, not a 500" is
 * a decision about the API's contract, and it should have one landing site.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAsNotFound, namedHandler, operationName } from '@infrastructure/http/controller';

/** What makes one entity's read-one different from another's. */
export interface ItemControllerSpec {
    /**
     * The entity, lower-case and singular — `'product'`. Names the operation (`getProductItem`),
     * so the log line, a stack trace and the generated tables in `docs/modules/` all agree with
     * the handler.
     */
    entity: string;
    /**
     * Fetch the row. Takes the request too, because visibility is a property of the CALLER:
     * `products` narrows by `callerScope`, `users` sits behind `requirePermission`. The row is `unknown`
     * because this controller never looks inside it — a miss is whatever the service answers for
     * one (`null`/`undefined`/`void`), and everything else is serialized as it comes.
     */
    fetch: (id: string, request: Request) => Promise<unknown>;
    /** The i18n key answered when the id matches nothing, or is not an id at all. */
    notFoundKey: string;
    /**
     * Appended after `entity` in the generated operation name, in place of the default `'Item'` —
     * for a second read-one on the same entity that would otherwise collide with the plain
     * `get<Entity>Item`, e.g. `'Admin'` for `getProductAdmin`.
     */
    handlerSuffix?: string;
}

/**
 * Build a module's read-one controller.
 *
 * @param spec - the four things that differ per entity
 * @returns the express handler, named for the entity it reads
 */
export const createItemController = ({
    entity,
    fetch,
    notFoundKey,
    handlerSuffix
}: ItemControllerSpec) => {
    // The name printed in stack traces, the request log line and `docs/modules/` — e.g. `getProductItem`.
    const operation = operationName('get', entity, handlerSuffix ?? 'Item');

    return namedHandler(operation, (request: Request, response: Response) => {
        // The module's own fetch — a miss answers `null`/`undefined`/`void`, never throws.
        return fetch(String(request.params.id), request)
            .then((item) => {
                if (!item) {
                    rejectResponse(response, 404, [t(notFoundKey)]);
                    return;
                }
                successResponse(response, item);
            })
            .catch(catchAsNotFound(response, operation, notFoundKey));
    });
};
