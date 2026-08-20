import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { auditLogService } from '@modules/audit-logs';
import { t } from '@infrastructure/i18n';
import { catchAs } from '@infrastructure/http/controller';
import { readInput } from '@infrastructure/http/request';
import { limitSchema } from '@infrastructure/http/schemas';

/**
 * GET /observability/audit
 * Recent audit events, filtered by actor, action, outcome, since, and limit.
 */
export const getObservabilityAuditLogs = (request: Request, response: Response) => {
    // Through `readInput` like every other route, rather than reaching into `request.query`: the
    // sources a surface reads are a property of the route, not of this handler.
    const { actor, action, outcome, since, limit } = readInput(request, {
        surface: 'search',
        // Declared as ids so a repeated `?since=` collapses to its first entry rather than
        // arriving as an array — these are scalars, and `new Date([…])` is not a date.
        ids: ['actor', 'action', 'outcome', 'since']
    });

    /*
     * `limit` CLAMPS rather than refusing — see `limitSchema`, which owns the three numbers this
     * endpoint answers by and which `openapi.yaml` declares. It is the one page-size rule in this
     * API that does not answer 422, because this read has no pages: "as much as you can" is the
     * honest reading of a number too large, and there is no second page to send anyone to.
     */
    const limitNumber = limitSchema.parse(limit);
    const sinceDate = since ? new Date(since) : undefined;

    if (sinceDate !== undefined && Number.isNaN(sinceDate.getTime()))
        return rejectResponse(response, 422, [t('observability.audit-since-invalid')]);

    return auditLogService
        .search({
            // `readInput` answers `unknown` because a query value can arrive repeated; these three
            // are scalars the repository matches verbatim, so they are read as the strings they are.
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
        .catch(catchAs(response, 'getObservabilityAuditLogs'));
};
