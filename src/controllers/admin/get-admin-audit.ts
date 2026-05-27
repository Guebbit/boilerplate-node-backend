import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@utils/response';
import { getAuditBuffer } from '@utils/audit';

/**
 * GET /admin/audit
 * Recent audit events from the in-memory ring buffer.
 * Supports optional filtering by actor, action, outcome, since, and limit.
 */
export const getAdminAuditLogs = (request: Request, response: Response) => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    const limitNum = Math.min(parseInt(limit ?? '50', 10) || 50, 200);
    const sinceDate = since ? new Date(since) : null;

    if (sinceDate !== null && isNaN(sinceDate.getTime()))
        return rejectResponse(response, 422, 'Validation failed', [
            'since must be a valid ISO-8601 timestamp'
        ]);

    let items = getAuditBuffer();

    if (actor) items = items.filter((e) => e.actor_user_id === actor);
    if (action) items = items.filter((e) => e.action === action);
    if (outcome === 'success' || outcome === 'failure')
        items = items.filter((e) => e.outcome === outcome);
    if (sinceDate) items = items.filter((e) => new Date(e.timestamp) > sinceDate);

    const limited = items.slice(0, limitNum);

    return successResponse(response, { items: limited, total: limited.length });
};

export default getAdminAuditLogs;
