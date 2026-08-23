/**
 * The soft/hard delete controller, written once.
 *
 * Three modules serve the same endpoint — `DELETE /x`, `DELETE /x/:id`, `DELETE /x/:id/hard` —
 * and their controllers were byte-identical after swapping the noun: normalise it away and the
 * whole diff is the JSDoc header, the service handle, the audit action and the not-found key.
 * ~195 lines expressing ~65, with three landing sites for any fix to the ObjectId→404 mapping and
 * no reason for a change to reach all three.
 *
 * A factory rather than a shared helper each controller calls, because the duplication is the
 * WHOLE controller, not a step inside it. Each module still owns a file — `controller-naming.
 * test.ts` requires one, and it should — but the file becomes a six-line declaration of what makes
 * this entity's delete different, which is what the one-controller-per-file convention is for.
 *
 * The returned function carries the entity's own name — `deleteOrder`, not a shared one — because
 * that name is what a stack trace prints and what the generated module-surface tables in
 * `docs/modules/` list per endpoint. A computed method name in an object literal is how a function
 * expression gets one.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse, type ResponseErrorItem } from './response';
import { rejectDatabaseError } from './errors';
import { extractAndValidateId, readInput } from './request';
import { hardDeleteSchema } from './schemas';
import { refused, rejectValidation } from './controller';
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
    const operation = `delete${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;

    const handler = {
        [operation](request: Request, response: Response) {
            const id = extractAndValidateId(request, response, operation, 'delete');
            if (!id) return Promise.resolve();

            // `hardDelete` is a boolean the route accepts three ways — see docs/theory/request-input.md.
            // The path form (`DELETE /x/:id/hard`) reaches `params` through `routeFlag`.
            //
            // KNOWN, DELIBERATE, AND ARGUABLY WRONG: contradictory sources are resolved rather
            // than refused. `DELETE /users/:id/hard` carrying `{"hardDelete": false}` destroys the
            // record, because params outrank body and the merge below never sees that the request
            // said both things. For a read that precedence is right — the URL a caller aimed at is
            // the more explicit statement of intent. For an IRREVERSIBLE operation it is the one
            // place a `||` chain is the wrong tool: a request that says "destroy" and "do not
            // destroy" is a client bug, and guessing which half to honour destroys data on the
            // strength of a coin flip.
            //
            // The suggested fix, NOT applied: read `hardDelete` from params, query and body
            // separately, and answer 409 when two of them disagree rather than letting the
            // highest-precedence source win. That is a behaviour change on a route that currently
            // succeeds, so it is Andrea's call, not a cleanup — recorded here and in
            // CONTRACT_PLAN_POLYMORPHISM.md rather than done.
            //
            // Note what is NOT the problem: `?hardDelete=false` alone already means false. That
            // was a separate bug (presence treated as the switch) and it is fixed — see the
            // Closed list in docs/theory/request-input.md.
            const input = readInput(request, { surface: 'delete', booleans: ['hardDelete'] });
            const parseResult = hardDeleteSchema.safeParse(input.hardDelete);
            if (!parseResult.success)
                return Promise.resolve(rejectValidation(response, parseResult.error));
            const hardDelete = parseResult.data;

            return remove(id, hardDelete)
                .then((result) => {
                    if (refused(response, result)) return;

                    emitAuditEvent(
                        buildAuditEvent(request, {
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
