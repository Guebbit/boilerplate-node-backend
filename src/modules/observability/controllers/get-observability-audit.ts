import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { auditLogService } from '@modules/audit-logs';
import { t } from '@infrastructure/i18n';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { readInput } from '@infrastructure/http/request';
import { paginationSchema } from '@infrastructure/http/schemas';

/**
 * GET /observability/audit
 * A page of audit events, filtered by actor, action, outcome and since.
 */
export const getObservabilityAuditLogs = (request: Request, response: Response) => {
    // Through `readInput` like every other route, rather than reaching into `request.query`: the
    // sources a surface reads are a property of the route, not of this handler.
    const input = readInput(request, {
        surface: 'search',
        // Declared as ids so a repeated `?since=` collapses to its first entry rather than
        // arriving as an array — these are scalars, and `new Date([…])` is not a date.
        ids: ['actor', 'action', 'outcome', 'since']
    });

    // `page` / `pageSize` are bounded here and answer 422, as on every paged read: this trail
    // has pages, so a page the caller cannot reach is a broken request rather than one to
    // quietly rewrite. `normalizePagination` still owns what an absent page means.
    const pagination = parseBody(paginationSchema, input, response);
    if (!pagination) return;

    const { actor, action, outcome, since } = input;
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
            ...pagination
        })
        .then((result) => successResponse(response, result))
        .catch(catchAs(response, 'getObservabilityAuditLogs'));
};
