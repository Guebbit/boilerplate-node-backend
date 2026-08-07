import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@core/http/response';
import { auditLogService } from '@services/audit-logs';
import { t } from '@core/i18n';

/** Hard ceiling on `limit`, matching `maximum: 200` on the parameter in `openapi.yaml`. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * GET /observability/audit
 * Recent audit events, filtered by actor, action, outcome, since, and limit.
 */
export const getObservabilityAuditLogs = (request: Request, response: Response) => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    const parsedLimit = Number.parseInt(limit ?? String(DEFAULT_LIMIT), 10);
    // `parseInt` answers NaN for a non-numeric `?limit=abc`, and NaN survives both Math.min and
    // Math.max — so it is caught here rather than reaching Mongo as an undefined page size.
    const limitNumber = Number.isNaN(parsedLimit)
        ? DEFAULT_LIMIT
        : Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);
    const sinceDate = since ? new Date(since) : undefined;

    if (sinceDate !== undefined && Number.isNaN(sinceDate.getTime()))
        return rejectResponse(response, 422, 'getObservabilityAuditLogs - invalid since', [
            t('observability.audit-since-invalid')
        ]);

    return auditLogService
        .search({
            actor,
            action,
            // The repository matches `outcome` verbatim, so anything outside the enum is dropped
            // rather than passed through — an unrecognised value must not silently return
            // everything, which is what treating it as "no filter" would do if it reached Mongo.
            outcome: outcome === 'success' || outcome === 'failure' ? outcome : undefined,
            since: sinceDate,
            limit: limitNumber
        })
        .then(({ items, total }) => successResponse(response, { items, total }))
        .catch((error: Error) =>
            rejectResponse(response, 500, 'getObservabilityAuditLogs', [error.message])
        );
};

export default getObservabilityAuditLogs;
