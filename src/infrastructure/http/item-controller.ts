/**
 * The read-one controller, written once.
 *
 * `GET /products/:id` and `GET /users/:id` were the same file twice: fetch by path id → 404 with
 * the module's own key when nothing comes back → the SAME 404 when Mongoose rejects the id as a
 * CastError → `rejectDatabaseError` for anything else. Only the fetch and the not-found key
 * differ, which is the shape `createDeleteController` and `createSearchController` already answer.
 *
 * The CastError branch is the reason this is worth sharing rather than leaving as ten lines each:
 * "a malformed id is a 404, not a 500" is a decision about the API's contract, and it should have
 * one landing site.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from './response';
import { rejectDatabaseError } from './errors';

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
     * `products` narrows by `callerScope` and reports the view, `users` sits behind `isAdmin` and
     * needs neither.
     *
     * The row is `unknown` because this controller never looks inside it: a miss is whatever the
     * service answers for one (`null`, `undefined`, and `void` where an empty id short-circuits),
     * and everything else is serialized as it comes.
     */
    fetch: (id: string, request: Request) => Promise<unknown>;
    /** The i18n key answered when the id matches nothing, or is not an id at all. */
    notFoundKey: string;
}

/**
 * Build a module's read-one controller.
 *
 * @param spec - the three things that differ per entity
 * @returns the express handler, named for the entity it reads
 */
export const createItemController = ({ entity, fetch, notFoundKey }: ItemControllerSpec) => {
    const operation = `get${entity.charAt(0).toUpperCase()}${entity.slice(1)}Item`;

    const handler = {
        [operation](request: Request, response: Response) {
            return fetch(String(request.params.id), request)
                .then((item) => {
                    if (!item) {
                        rejectResponse(response, 404, [t(notFoundKey)]);
                        return;
                    }
                    successResponse(response, item);
                })
                .catch((error: CastError) => {
                    // A malformed id reaches Mongoose as a CastError rather than a miss, and the
                    // honest answer is the same 404 a well-formed unknown id gets.
                    if (error.kind === 'ObjectId')
                        return rejectResponse(response, 404, [t(notFoundKey)]);
                    rejectDatabaseError(response, operation, error);
                });
        }
    }[operation];

    return handler;
};
