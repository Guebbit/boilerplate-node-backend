/**
 * @module
 * The soft/hard delete controller shared by every module with a `DELETE /x`, `DELETE /x/:id` and
 * `DELETE /x/:id/hard` triplet. Each module still owns a controller file (required by
 * `controller-naming.test.ts`), which becomes a short spec of what differs per entity — name,
 * service call, audit action, not-found key. The handler carries the entity's own name (e.g.
 * `deleteOrder`) via a computed property key, since that is what stack traces and the generated
 * `docs/modules/` tables print.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    rejectResponse,
    successResponse,
    type ResponseErrorItem
} from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { extractAndValidateId, readInput, callerContextOf } from '@infrastructure/http/request';
import { hardDeleteSchema } from '@infrastructure/http/schemas';
import { refused, rejectValidation } from '@infrastructure/http/controller';
import {
    emitAuditEvent,
    buildAuditEvent,
    type AuditAction
} from '@infrastructure/observability/audit';

/** The envelope a `remove` answers with — the shape `generateSuccess`/`generateReject` produce. */
interface RemoveResult {
    success: boolean;
    status: number;
    message?: string;
    errors?: ResponseErrorItem[];
}

/** What makes one entity's delete different from another's. */
export interface DeleteControllerSpec {
    /**
     * The entity, lower-case and singular — `'order'`. Used for the audit `target_type` and to
     * name the operation in the log line (`deleteOrder`), so the two cannot disagree.
     */
    entity: string;
    /** The service call. `hardDelete` true destroys the row; false stamps `deletedAt`. */
    remove: (id: string, hardDelete: boolean) => Promise<RemoveResult>;
    /** The module's own audit action for a successful delete. */
    auditAction: AuditAction;
    /** The i18n key answered when the id is well-formed but matches nothing. */
    notFoundKey: string;
}

/**
 * Build a module's delete controller.
 *
 * @param spec - the four things that differ per entity
 * @returns the express handler, named for the entity it deletes
 */
export const createDeleteController = ({
    entity,
    remove,
    auditAction,
    notFoundKey
}: DeleteControllerSpec) => {
    // The name printed in stack traces, audit logs and the request log line — e.g. `deleteOrder`.
    const operation = `delete${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;

    // A computed property key, not a plain function expression, so `handler.name` is `operation`
    // instead of the generic name an anonymous function would carry.
    const handler = {
        [operation](request: Request, response: Response) {
            // Reads `:id` off the route, 422s and returns undefined if it's missing or malformed.
            const id = extractAndValidateId(request, response, 'delete');
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

            return remove(id, hardDelete)
                .then((result) => {
                    // Sends the error envelope and stops here if the service refused.
                    if (refused(response, result)) return;

                    emitAuditEvent(
                        buildAuditEvent(callerContextOf(request), {
                            action: auditAction,
                            outcome: 'success',
                            target_type: entity,
                            target_id: id,
                            metadata: { hardDelete }
                        })
                    );
                    successResponse(response, undefined, 200, result.message);
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
