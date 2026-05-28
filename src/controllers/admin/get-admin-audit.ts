import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@utils/response';
import { getAuditEvents } from '@utils/audit';

/*
 * GET /admin/audit
 * Returns the most recent events from the in-memory audit ring buffer.
 * Supports optional query filters: actor, action, outcome, since, limit.
 */
export const getAdminAudit = (request: Request, response: Response): void => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    if (outcome && outcome !== 'success' && outcome !== 'failure') {
        rejectResponse(response, 422, 'invalid outcome filter');
        return;
    }

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
        rejectResponse(response, 422, 'invalid limit');
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
