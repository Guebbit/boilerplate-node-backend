import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@core/http/response';
import { getAuditBuffer } from '@core/observability/audit';
import { t } from '@core/i18n';

/**
 * GET /observability/audit
 * Recent audit events from the in-memory ring buffer.
 * Supports optional filtering by actor, action, outcome, since, and limit.
 */
export const getObservabilityAuditLogs = (request: Request, response: Response) => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    const limitNumber = Math.min(Number.parseInt(limit ?? '50', 10), 200);
    const sinceDate = since ? new Date(since) : undefined;

    if (sinceDate !== undefined && Number.isNaN(sinceDate.getTime()))
        return rejectResponse(response, 422, 'getObservabilityAuditLogs - invalid since', [
            t('observability.audit-since-invalid')
        ]);

    let items = getAuditBuffer();

    if (actor) items = items.filter((e) => e.actor_user_id === actor);
    if (action) items = items.filter((e) => e.action === action);
    if (outcome === 'success' || outcome === 'failure')
        items = items.filter((e) => e.outcome === outcome);
    if (sinceDate) items = items.filter((e) => new Date(e.timestamp) > sinceDate);

    const limited = items.slice(0, limitNumber);

    return successResponse(response, { items: limited, total: limited.length });
};

export default getObservabilityAuditLogs;
