/**
 * @module
 * Controller for `GET /observability/audit`. A filtered, paged read over `audit-logs`' collection —
 * the one place this module reaches beyond its own process snapshot, and the reason it depends on
 * `audit-logs` at all.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import type { AuditEventItem, AuditLogsPage } from '@types';
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
        // `list`: a GET-only route, so the query string is the whole input surface.
        surface: 'list',
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
        .then((result) => {
            // `search()` already returns normalized (wire-shape) rows — unlike `findById`/`findOne`,
            // it never hands back a hydrated document, so there is no `.toJSON()` to apply here.
            // The repository factory's `PaginatedResult<TDocument>` names the pre-normalize type,
            // which is why `items` needs the cast below.
            const items: unknown = result.items;
            return successResponse<AuditLogsPage>(response, {
                items: items as AuditEventItem[],
                meta: result.meta
            });
        })
        .catch(catchAs(response, 'getObservabilityAuditLogs'));
};
