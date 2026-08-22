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
    page?: unknown;
    pageSize?: unknown;
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
 * Newest first, with `_id` breaking ties.
 *
 * Not `DEFAULT_SORT`: this model sets `timestamps: false` and carries its own `timestamp`, so the
 * shared constant would sort on a field that does not exist. The `_id` tiebreaker is what the
 * shared one is for — `timestamp` is not unique, and a paged read whose tie order moves between
 * its count and its page returns a document twice or not at all.
 */
export const AUDIT_SORT: Record<string, 1 | -1> = { timestamp: -1, _id: -1 };

/**
 * `since` as a scope fragment rather than a declared filter.
 *
 * The spec's `ranges` coerce their bounds with `Number()`, which is right for a price and wrong
 * for a date. `scope` is merged after `buildWhere` and never passes through it, so the bound
 * arrives at Mongo as the `Date` the controller parsed.
 */
const sinceScope = (since?: Date): Record<string, unknown> =>
    since ? { timestamp: { $gt: since } } : {};

export const auditLogRepository = {
    create: base.create,
    search: base.search,
    sinceScope
};
