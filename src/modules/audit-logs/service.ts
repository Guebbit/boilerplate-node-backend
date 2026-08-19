import { auditLogRepository } from './repository';
import type { AuditLogSearchFilters } from './repository';
import type { AuditEntry } from '@infrastructure/observability/audit';
import type { AuditLogDocument } from './model';
import { logger } from '@infrastructure/adapters/logger';
import { auditSinkFailuresTotal } from './metrics';

/**
 * Audit log service — the persistence sink behind `@infrastructure/observability/audit`, and the read path
 * behind `GET /observability/audit`.
 */

/**
 * Store an emitted audit entry. This is the {@link AuditSink} implementation that
 * `@modules/audit-logs/module` registers at import time.
 *
 * Fire-and-forget by contract: it returns `void`, and every failure is swallowed into a log line.
 * That is not laziness about errors — it is the fail-open property the whole audit path depends
 * on. These entries are written while answering requests, including failing ones, so a Mongo
 * hiccup here must not turn a rejected login into a 500. The compliance record is the audit
 * *logger*, which has already written the same entry by the time this runs; losing the queryable
 * copy degrades the admin dashboard and nothing else.
 *
 * `void` on the promise marks the floating call as deliberate, and the `.catch()` is what keeps a
 * rejected write from surfacing as an unhandled rejection — which, unlike the failed write, would
 * genuinely be able to take the process down.
 */
export const record = (entry: AuditEntry): void => {
    void auditLogRepository.create(entry as Partial<AuditLogDocument>).catch((error: Error) => {
        // Before the log line, so the count is right even if the logger is what is broken.
        auditSinkFailuresTotal.inc();
        logger.warn({
            message: 'audit entry not persisted',
            action: entry.action,
            error: error.message
        });
    });
};

/**
 * Read a filtered page of audit entries, newest first.
 *
 * Rejections propagate, unlike in {@link record}: this one is answering an admin's explicit
 * request for the data, so a failed read is a failed request rather than something to hide.
 */
export const search = (
    filters: AuditLogSearchFilters
): Promise<{ items: AuditLogDocument[]; total: number }> => auditLogRepository.search(filters);

export const auditLogService = {
    record,
    search
};
