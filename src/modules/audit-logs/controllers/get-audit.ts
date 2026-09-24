/**
 * @module
 * Controller for `GET /audit`. The same filtered, paged read `observability`'s
 * `getObservabilityAuditLogs` serves, reached with a tenant key instead of a platform one — see
 * `../service.ts` for why one collection answers both.
 *
 * See: docs/modules/audit-logs.md
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListAuditEntriesQueryParams } from '@api/schemas.zod';
import { auditLogService } from '../service';
import { createListController } from '@infrastructure/surfaces/create-list-controller';

/** Handles `GET /audit`: a page of this shop's own action history, filtered and paged. */
export const getAudit = createListController({
    entity: 'auditEntries',
    // The generated `outcome` enum rejects anything outside `success`/`failure` with a 422
    // instead of the filter silently matching every row — `page`/`pageSize` swapped for the
    // infra pair so an absent one stays absent for `normalizePagination` to default.
    schema: ListAuditEntriesQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    input: { ids: ['actor', 'action', 'outcome', 'target', 'since'] },
    runList: (parsed) =>
        auditLogService.search({
            ...parsed,
            since: parsed.since ? new Date(parsed.since) : undefined
        })
});
