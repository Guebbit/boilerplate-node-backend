import type { Request, Response } from 'express';
import { getRecentAuditEvents } from '@utils/audit';
import { successResponse, rejectResponse } from '@utils/response';

/** Returns recent audit events from the in-memory ring buffer. */
export const getAdminAuditLogs = (request: Request, response: Response): void => {
    const { actor, action, outcome, since, limit } = request.query as Record<string, string>;

    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
        rejectResponse(response, 422, 'limit must be between 1 and 200');
        return;
    }

    if (outcome && outcome !== 'success' && outcome !== 'failure') {
        rejectResponse(response, 422, 'outcome must be "success" or "failure"');
        return;
    }

    if (since && Number.isNaN(new Date(since).getTime())) {
        rejectResponse(response, 422, 'since must be a valid ISO-8601 date-time string');
        return;
    }

    const items = getRecentAuditEvents({
        actor,
        action,
        outcome: outcome as 'success' | 'failure' | undefined,
        since,
        limit: parsedLimit
    });

    successResponse(response, { items, total: items.length }, 200, 'Audit log');
};
