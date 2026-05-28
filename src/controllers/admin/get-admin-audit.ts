import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@utils/response';
<<<<<<< HEAD
import { getAuditEvents } from '@utils/audit';

/*
 * GET /admin/audit
 * Returns the most recent events from the in-memory audit ring buffer.
 * Supports optional query filters: actor, action, outcome, since, limit.
 */
export const getAdminAudit = (request: Request, response: Response): void => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    if (outcome && outcome !== 'success' && outcome !== 'failure') {
        rejectResponse(response, 422, 'invalid outcome — must be "success" or "failure"');
        return;
    }

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
        rejectResponse(response, 422, 'invalid limit — must be a positive integer');
        return;
    }

    const items = getAuditEvents({
        actor,
        action,
        outcome: outcome as 'success' | 'failure' | undefined,
        since,
        limit: parsedLimit
    });

    successResponse(response, { items, total: items.length });
};
=======
import { getAuditBuffer } from '@utils/audit';

/**
 * GET /admin/audit
 * Recent audit events from the in-memory ring buffer.
 * Supports optional filtering by actor, action, outcome, since, and limit.
 */
export const getAdminAuditLogs = (request: Request, response: Response) => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    const limitNumber = Math.min(Number.parseInt(limit ?? '50', 10), 200);
    const sinceDate = since ? new Date(since) : undefined;

    if (sinceDate !== undefined && Number.isNaN(sinceDate.getTime()))
        return rejectResponse(response, 422, 'Validation failed', [
            'since must be a valid ISO-8601 timestamp'
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

export default getAdminAuditLogs;
>>>>>>> origin/main
