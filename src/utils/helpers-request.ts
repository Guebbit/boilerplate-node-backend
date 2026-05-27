import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import { rejectResponse, successResponse } from './response';
import { emitAuditEvent, extractRequestContext, AuditAction } from './audit';

/**
 * Normalize pagination parameters from a pre-merged source object.
 * Falls back to NODE_SETTINGS_PAGINATION_PAGE_SIZE env var.
 *
 * Usage: extractPagination({ page: request.body.page ?? request.query.page, pageSize: ... })
 */
export const extractPagination = (
    parameters: { page?: string | number; pageSize?: string | number } = {}
): { page: number | undefined; pageSize: number | undefined } => {
    const pageSizeRaw = parameters.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
    return {
        page: parameters.page ? Number(parameters.page) : undefined,
        pageSize: pageSizeRaw ? Number(pageSizeRaw) : undefined
    };
};

/**
 * Pick the first defined non-empty value across multiple sources in priority order.
 * Usage: extractId(request.parameters.id, request.body.id, request.query.id)
 */
export const extractId = (...candidates: (string | undefined)[]): string | undefined =>
    candidates.find(Boolean) as string | undefined;

/**
 * Parse a request input that can be string[], comma-separated string, or scalar into a clean string[].
 */
export const extractStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string')
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    if (value === undefined || value === null) return [];
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
};

/**
 * Merge body and query into a single value, preferring body.
 * Reduces boilerplate in GET/search controllers.
 */
export const mergeBodyQuery = <T extends Record<string, unknown>>(
    body: Partial<T> | undefined,
    query: Partial<Record<keyof T, string>> | undefined
): Partial<T> => {
    const result: Partial<T> = {};
    const merged = { ...query, ...body } as Partial<T>;
    for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
    return result;
};

/**
 * Extract pagination from request body+query in one call.
 * Convenience wrapper combining mergeBodyQuery + extractPagination.
 */
export const extractRequestPagination = (
    request: Request<ParamsDictionary>
): { page: number | undefined; pageSize: number | undefined } =>
    extractPagination({
        page: (request.body as Record<string, unknown>)?.page as string | undefined ?? (request.query as Record<string, string>).page,
        pageSize: (request.body as Record<string, unknown>)?.pageSize as string | undefined ?? (request.query as Record<string, string>).pageSize
    });

/**
 * Validate a MongoDB ObjectId from request params/body.
 * Returns the id or sends a 422 response and returns undefined.
 */
export const extractAndValidateId = (
    request: Request<ParamsDictionary>,
    response: Response,
    entityLabel: string
): string | undefined => {
    const rawId = request.params.id ?? (request.body as { id?: string }).id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !Types.ObjectId.isValid(id)) {
        rejectResponse(response, 422, `${entityLabel} - missing id`, [
            t('generic.error-missing-data')
        ]);
        return undefined;
    }
    return id;
};

/**
 * Options for the generic delete controller factory.
 */
export interface IDeleteControllerOptions {
    /** Label used in log messages (e.g. "deleteProduct") */
    entityLabel: string;
    /** i18n key for the "not found" message */
    notFoundKey: string;
    /** Audit action enum value */
    auditAction: AuditAction;
    /** Target type for audit events (e.g. "product", "user") */
    targetType: string;
    /** Service remove function */
    remove: (id: string, hardDelete?: boolean) => Promise<{ success: boolean; status: number; message: string; errors?: string[] }>;
    /** Whether hardDelete is supported (extracted from query or body) */
    supportsHardDelete?: boolean;
}

/**
 * Factory for delete controllers. Eliminates duplicated id-validation, service call, audit, and error handling.
 */
export const createDeleteController = (options: IDeleteControllerOptions) =>
    (request: Request<ParamsDictionary>, response: Response) => {
        const id = extractAndValidateId(request, response, options.entityLabel);
        if (!id) return Promise.resolve();

        const hardDelete = options.supportsHardDelete
            ? !!(request.query.hardDelete ?? request.params.hardDelete ?? (request.body as { hardDelete?: boolean }).hardDelete)
            : undefined;

        return options
            .remove(id, hardDelete)
            .then((result) => {
                if (!result.success) {
                    rejectResponse(response, result.status, result.message, result.errors);
                    return;
                }
                emitAuditEvent({
                    action: options.auditAction,
                    actor_user_id: request.user?.id ?? 'unknown',
                    actor_role: 'admin',
                    outcome: 'success',
                    target_type: options.targetType,
                    target_id: id,
                    ...extractRequestContext(request),
                    ...(hardDelete === undefined ? {} : { metadata: { hardDelete } })
                });
                successResponse(response, undefined, 200, result.message);
            })
            .catch((error: CastError) => {
                if (error.message == '404' || error.kind === 'ObjectId')
                    rejectResponse(response, 404, `${options.entityLabel} - not found`, [
                        t(options.notFoundKey)
                    ]);
                rejectResponse(response, 500, 'Unknown Error', [error.message]);
            });
    };
