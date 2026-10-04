/**
 * @module
 * Audit log repository.
 *
 * Two entry points only — append one entry, read a filtered page. There is deliberately no
 * update or delete: an audit trail that can be edited from the application is not an audit trail,
 * and expiry is Mongo's job via the TTL index on the model.
 *
 * See: docs/modules/audit-logs.md
 */

import { auditLogModel, applyAuditLogTransform } from './model';
import type { AuditLogDocument } from './model';
import { createRepository } from '@infrastructure/persistence/create-repository';
import type { AuditEntryItem } from '@types';
import type { Types } from 'mongoose';

/**
 * What `search` accepts, mirroring the query parameters `GET /observability/audit` and
 * `GET /audit` declare. `target` is the one the tenant-facing route adds — "what happened to
 * this row" is the question a moderator asks that an operator's dashboard never does.
 */
export interface AuditLogSearchFilters {
    actor?: string;
    action?: string;
    outcome?: 'success' | 'failure';
    /** Exclusive lower bound on `timestamp`, matching the buffer's `> since` behaviour. */
    since?: Date;
    target?: string;
    page?: unknown;
    pageSize?: unknown;
}

/** The shared repository factory's create/search pair, scoped to the audit collection. */
const base = createRepository<AuditLogDocument, AuditEntryItem>(auditLogModel, {
    transform: applyAuditLogTransform,
    searchable: {
        // All four are closed vocabularies or opaque ids — matched verbatim, never as a regex.
        // `outcome` in particular must not be a partial match: 'fail' silently matching 'failure'
        // would make a filtered view quietly disagree with the numbers next to it.
        exact: {
            actor: 'actor_user_id',
            action: 'action',
            outcome: 'outcome',
            target: 'target_id'
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

/**
 * Where the next page of an actor's own entries starts, newest first. `timestamp` alone is not
 * unique, so `seen` names the ids already returned AT that timestamp: the next page takes everything
 * at or before it except those.
 */
export interface OwnEntriesCursor {
    timestamp: Date;
    seen: Types.ObjectId[];
}

/** One page of an actor's own entries, and where the one after it starts. */
export interface OwnEntriesPage {
    items: AuditEntryItem[];
    /** `undefined` when this page was the last. */
    next: OwnEntriesCursor | undefined;
}

/**
 * The cursor for the page after `rows`: the oldest timestamp reached, with every id already
 * returned at that timestamp (carried over from `after` when the page did not move past it).
 *
 * @param rows - the page just read, newest first, never empty
 * @param after - the cursor the page was read from
 */
const cursorAfter = (
    rows: { _id: Types.ObjectId; timestamp: Date }[],
    after: OwnEntriesCursor | undefined
): OwnEntriesCursor => {
    const { timestamp } = rows.at(-1)!;
    const atEdge = rows.filter((row) => row.timestamp.getTime() === timestamp.getTime());
    const carried = after?.timestamp.getTime() === timestamp.getTime() ? after.seen : [];
    return { timestamp, seen: [...carried, ...atEdge.map((row) => row._id)] };
};

/**
 * One page of an actor's OWN entries by keyset cursor, for the account's data export.
 *
 * No `countDocuments` and no `skip`: the shared `search` counts and skips on every page, so reading
 * an actor's whole trail that way costs work quadratic in its length. This walks the
 * `{ actor_user_id, timestamp }` index from where the last page ended, so each page costs a page.
 *
 * @param actor - the account whose entries are read; never anyone else's
 * @param after - the cursor the previous page returned, or `undefined` for the first page
 * @param limit - the page size
 */
const ownEntriesPage = (
    actor: string,
    after: OwnEntriesCursor | undefined,
    limit: number
): Promise<OwnEntriesPage> =>
    auditLogModel
        .find({
            actor_user_id: actor,
            ...(after ? { timestamp: { $lte: after.timestamp }, _id: { $nin: after.seen } } : {})
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean<{ _id: Types.ObjectId; timestamp: Date }[]>()
        .exec()
        .then((rows) => {
            // The cursor first: `normalize` rewrites each row in place (`timestamp` becomes a
            // string, `_id` goes), and the cursor needs both as they were stored.
            const next = rows.length < limit ? undefined : cursorAfter(rows, after);
            return { items: base.normalize(rows), next };
        });

/*
 * Four members, not the base repository's full surface. An audit trail is append-and-read: no
 * `save`, no `deleteOne`, so the type is what refuses an edit rather than a reviewer.
 */
export const auditLogRepository = {
    create: base.create,
    search: base.search,
    sinceScope,
    ownEntriesPage
};
