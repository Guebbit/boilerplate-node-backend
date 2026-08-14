import { auditLogModel, applyAuditLogTransform } from './model';
import type { AuditLogDocument } from './model';
import { createBaseRepository } from '@infrastructure/persistence/base-repository';

/**
 * Audit Log Repository
 *
 * Two entry points only — append one entry, read a filtered page. There is deliberately no
 * update or delete: an audit trail that can be edited from the application is not an audit trail,
 * and expiry is Mongo's job via the TTL index on the model.
 */

/** What `search` accepts, mirroring the query parameters `GET /observability/audit` declares. */
export interface AuditLogSearchFilters {
    actor?: string;
    action?: string;
    outcome?: 'success' | 'failure';
    /** Exclusive lower bound on `timestamp`, matching the buffer's `> since` behaviour. */
    since?: Date;
    limit?: number;
}

const base = createBaseRepository<AuditLogDocument>(auditLogModel, {
    transform: applyAuditLogTransform,
    searchable: {
        // All three are closed vocabularies or opaque ids — matched verbatim, never as a regex.
        // `outcome` in particular must not be a partial match: 'fail' silently matching 'failure'
        // would make a filtered view quietly disagree with the numbers next to it.
        exact: {
            actor: 'actor_user_id',
            action: 'action',
            outcome: 'outcome'
        }
    }
});

/**
 * Filter → count → page, newest first.
 *
 * `since` is applied outside the declared search spec because the spec's `ranges` coerce their
 * bounds with `Number()`, which is right for a price and wrong for a date. The controller has
 * already validated and parsed it, so what arrives here is a real `Date` or nothing.
 *
 * `total` is the count of everything matching the filters, not the size of the returned page —
 * that is the whole point of counting separately, and it is what lets the dashboard say "50 of
 * 3,412" instead of "50 of 50".
 */
const search = (
    filters: AuditLogSearchFilters = {}
): Promise<{ items: AuditLogDocument[]; total: number }> => {
    const where = base.buildWhere(filters);
    if (filters.since) where.timestamp = { $gt: filters.since };

    return base
        .count(where)
        .then((total) =>
            base
                .findAll(where, { sort: { timestamp: -1 }, limit: filters.limit ?? 50 })
                .then((items) => ({ items: base.normalize(items), total }))
        );
};

export const auditLogRepository = {
    create: base.create,
    search
};
