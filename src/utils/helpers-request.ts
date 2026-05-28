import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from 'i18next';
import { Types } from 'mongoose';
import { rejectResponse } from './response';

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
): { page: number | undefined; pageSize: number | undefined } => {
    const merged = mergeBodyQuery(
        request.body as Record<string, unknown> | undefined,
        request.query as Record<string, string> | undefined
    );
    return extractPagination({
        page: merged.page as string | undefined,
        pageSize: merged.pageSize as string | undefined
    });
};

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
 * Validate a MongoDB ObjectId from explicit request fields.
 * Returns normalized id or sends a 422 response and returns undefined.
 */
export const extractAndValidateCustomId = (
    request: Request,
    response: Response,
    entityLabel: string,
    fields: { param?: string; body?: string } = {}
): string | undefined => {
    const fromParameters = fields.param ? request.params[fields.param] : undefined;
    const body = request.body as Record<string, unknown>;
    const fromBody = fields.body ? body[fields.body] : undefined;
    const rawId = extractId(
        Array.isArray(fromParameters)
            ? fromParameters[0]
            : (fromParameters as string | undefined),
        Array.isArray(fromBody) ? String(fromBody[0]) : (fromBody as string | undefined)
    );

    if (!rawId || !Types.ObjectId.isValid(rawId)) {
        rejectResponse(response, 422, `${entityLabel} - missing id`, [
            t('generic.error-missing-data')
        ]);
        return undefined;
    }
    return rawId;
};

/**
 * Extract the hardDelete flag from query, params, or body.
 * Used by delete controllers that support soft/hard delete.
 */
export const extractHardDelete = (request: Request<ParamsDictionary>): boolean =>
    !!(
        request.query.hardDelete ??
        request.params.hardDelete ??
        (request.body as { hardDelete?: boolean }).hardDelete
    );
