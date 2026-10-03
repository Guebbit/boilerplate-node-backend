/**
 * @module
 * The soft/hard delete controller shared by every module with a `DELETE /x`, `DELETE /x/:id` and
 * `DELETE /x/:id/hard` triplet. Each module still owns a controller file — `delete-<entity>.ts`,
 * one call to this factory — which becomes a short spec of what differs per entity — name,
 * service call, not-found key. The handler carries the entity's own name (e.g.
 * `deleteOrder`) via a computed property key, since that is what stack traces and the generated
 * `docs/modules/` tables print.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { withIfMatch } from '@infrastructure/http/preconditions';
import { readInput } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { hardDeleteSchema } from '@infrastructure/http/schemas';
import {
    catchAs,
    namedHandler,
    operationName,
    refused,
    rejectValidation,
    type ServiceResult
} from '@infrastructure/http/controller';

/** What makes one entity's delete different from another's. */
export interface DeleteControllerSpec {
    /**
     * The entity, lower-case and singular — `'order'`. Used to name the operation in the log
     * line (`deleteOrder`), so the two cannot disagree.
     */
    entity: string;
    /**
     * The service call. `hardDelete` true destroys the row; false stamps `deletedAt`. Takes the
     * raw `request` so the module's own wiring can build its `CallerContext` and hand it down —
     * the service records its own audit row (rule 1, `docs/theory/module-lifecycle.md`), the same
     * way `createUpdateController`'s `update` does.
     */
    remove: (id: string, hardDelete: boolean, request: Request) => Promise<ServiceResult<unknown>>;
    /** The i18n key answered when the id matches nothing, or is not an id at all. */
    notFoundKey: string;
}

/**
 * Build a module's delete controller.
 *
 * @param spec - the three things that differ per entity
 * @returns the express handler, named for the entity it deletes
 */
export const createDeleteController = ({ entity, remove, notFoundKey }: DeleteControllerSpec) => {
    // The name printed in stack traces, audit logs and the request log line — e.g. `deleteOrder`.
    const operation = operationName('delete', entity);

    return namedHandler(operation, (request: Request, response: Response) => {
        // Reads `id` off the route, query or body. A malformed one is the same 404 an unknown id
        // gets when it came in the path, and a 422 naming `id` when it came any other way.
        const id = requireId(request, response, { notFound: notFoundKey, surface: 'delete' });
        if (!id) return Promise.resolve();

        // `hardDelete` arrives three ways (path segment via `routeFlag`, query, or body) and
        // is OR'd across sources rather than following surface precedence: any true wins, all
        // false/absent defaults to false, any undecodable value 422s. OR avoids `false`
        // (the default, what nobody types) ever outvoting a `true` someone deliberately sent
        // on a different transport.
        const input = readInput(request, { surface: 'delete', anyTrue: ['hardDelete'] });
        // Validates the merged `hardDelete` value against its schema; 422s and returns
        // undefined on failure.
        const parseResult = hardDeleteSchema.safeParse(input.hardDelete);
        if (!parseResult.success)
            return Promise.resolve(rejectValidation(response, parseResult.error));
        const hardDelete = parseResult.data;

        // An `If-Match` on the request fences the delete; without one this is just `remove()`.
        return withIfMatch(request, id, () => remove(id, hardDelete, request))
            .then((result) => {
                // Sends the error envelope and stops here if the service refused.
                if (refused(response, result)) return;

                successResponse(response, undefined, 200, result.message);
            })
            .catch(catchAs(response, operation));
    });
};
