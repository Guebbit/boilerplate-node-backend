/**
 * @module
 * Controller for `GET /observability/audit`. A filtered, paged read over `audit-logs`' collection —
 * the one place this module reaches beyond its own process snapshot, and the reason it depends on
 * `audit-logs` at all.
 *
 * See: docs/modules/observability.md
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { GetObservabilityAuditLogsQueryParams } from '@api/schemas.zod';
import { auditLogService } from '@modules/audit-logs';
import { createListController } from '@infrastructure/surfaces/create-list-controller';

/** Handles `GET /observability/audit`: a page of audit events, filtered by actor, action, outcome and since. */
export const getObservabilityAuditLogs = createListController({
    entity: 'observabilityAuditLogs',
    // The generated `outcome` enum rejects anything outside `success`/`failure` with a 422
    // instead of the filter silently matching every row — `page`/`pageSize` swapped for the
    // infra pair so an absent one stays absent for `normalizePagination` to default.
    schema: GetObservabilityAuditLogsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    input: { ids: ['actor', 'action', 'outcome', 'since'] },
    runList: (parsed) =>
        auditLogService.search({
            ...parsed,
            since: parsed.since ? new Date(parsed.since) : undefined
        })
});
