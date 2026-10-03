/**
 * @module
 * The restore controller shared by every module whose `DELETE /x/:id` soft-deletes: the
 * `POST /x/:id/restore` that undoes it. A separate verb because DELETE must be safe to repeat
 * (RFC 9110 §9.2.2) — a retried DELETE must never bring a record back.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import {
    catchAs,
    namedHandler,
    operationName,
    refused,
    type ServiceResult
} from '@infrastructure/http/controller';

/** What makes one entity's restore different from another's. */
export interface RestoreControllerSpec<TRow> {
    /** The entity, lower-case and singular — `'order'`; names the log line. */
    entity: string;
    /**
     * The service call: 404 when absent, 409 when not soft-deleted, the restored row otherwise.
     * Takes the raw `request` so the module's own wiring can build its `CallerContext` and hand
     * it down — the service records its own audit row (rule 1,
     * `docs/theory/module-lifecycle.md`), the same way `createUpdateController`'s `update` does.
     */
    restore: (id: string, request: Request) => Promise<ServiceResult<TRow>>;
    /**
     * The restored row in the entity's contract shape — the same projection its own reads
     * answer with, so a restore never hands out fields a read would not.
     */
    present: (row: TRow, request: Request) => unknown;
    /** The i18n key answered when the id matches nothing, or is not an id at all. */
    notFoundKey: string;
}

/**
 * Build a module's restore controller.
 *
 * @param spec - the three things that differ per entity
 * @returns the express handler, named for the entity it restores (e.g. `restoreOrder`)
 */
export const createRestoreController = <TRow>({
    entity,
    restore,
    present,
    notFoundKey
}: RestoreControllerSpec<TRow>) => {
    const operation = operationName('restore', entity);

    return namedHandler(operation, (request: Request, response: Response) => {
        // Reads `:id` off the route; a malformed one answers as an unknown one.
        const id = requireId(request, response, { notFound: notFoundKey });
        if (!id) return Promise.resolve();

        return restore(id, request)
            .then((result) => {
                // Sends the error envelope (404, 409) and stops here if the service refused.
                if (refused(response, result)) return;

                return Promise.resolve(present(result.data, request)).then((shaped) => {
                    successResponse(response, shaped, 200, result.message);
                });
            })
            .catch(catchAs(response, operation));
    });
};
