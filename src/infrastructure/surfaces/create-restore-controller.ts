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
import { extractAndValidateId, callerContextOf } from '@infrastructure/http/request';
import {
    catchAsNotFound,
    namedHandler,
    operationName,
    refused,
    type ServiceResult
} from '@infrastructure/http/controller';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';

/** What makes one entity's restore different from another's. */
export interface RestoreControllerSpec<TRow> {
    /** The entity, lower-case and singular — `'order'`; the audit `target_type` and log name. */
    entity: string;
    /** The service call: 404 when absent, 409 when not soft-deleted, the restored row otherwise. */
    restore: (id: string) => Promise<ServiceResult<TRow>>;
    /**
     * The restored row in the entity's contract shape — the same projection its own reads
     * answer with, so a restore never hands out fields a read would not.
     */
    present: (row: TRow, request: Request) => unknown;
    /** The module's own audit action for a successful restore. */
    auditAction: AuditAction;
    /** The i18n key answered when the id is well-formed but matches nothing. */
    notFoundKey: string;
}

/**
 * Build a module's restore controller.
 *
 * @param spec - the four things that differ per entity
 * @returns the express handler, named for the entity it restores (e.g. `restoreOrder`)
 */
export const createRestoreController = <TRow>({
    entity,
    restore,
    present,
    auditAction,
    notFoundKey
}: RestoreControllerSpec<TRow>) => {
    const operation = operationName('restore', entity);

    return namedHandler(operation, (request: Request, response: Response) => {
        // Reads `:id` off the route, 422s and returns undefined if it's missing or malformed.
        const id = extractAndValidateId(request, response, 'path');
        if (!id) return Promise.resolve();

        return restore(id)
            .then((result) => {
                // Sends the error envelope (404, 409) and stops here if the service refused.
                if (refused(response, result)) return;

                recordAudit(callerContextOf(request), {
                    action: auditAction,
                    outcome: 'success',
                    target_type: entity,
                    target_id: id
                });
                return Promise.resolve(present(result.data, request)).then((shaped) => {
                    successResponse(response, shaped, 200, result.message);
                });
            })
            .catch(catchAsNotFound(response, operation, notFoundKey));
    });
};
