/**
 * @module
 * Audit log service — the persistence sink behind `@infrastructure/observability/audit`, and the
 * read path behind `GET /observability/audit` (the platform operator's view) and `GET /audit`
 * (a tenant staff member's, gated on `read:AuditLog`).
 *
 * @see docs/modules/audit-logs.md#the-pipeline
 */

import { auditLogRepository, AUDIT_SORT } from './repository';
import type { AuditLogSearchFilters, OwnEntriesCursor } from './repository';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type { AuditAction, AuditEntry } from '@infrastructure/observability/audit';
import { SHOP_REFUSAL_REASONS } from '@modules/access';
import type { AuditLogDocument } from './model';
import type { AuditEntryItem } from '@types';
import { DAY_MS } from '@domain-primitives/time';
import { auditLogsConfig } from './config';
import { logger } from '@infrastructure/adapters/logger';
import { auditSinkFailuresTotal } from './metrics';
import { presentIncidentEntry } from './presenter';

/**
 * Store an emitted audit entry. This is the {@link AuditSink} implementation that
 * `@modules/audit-logs/module` registers from its `onRegistered` hook.
 *
 * Fail-open: fire-and-forget by contract — it returns `void`, and every failure is swallowed into
 *            a log line. Not laziness about errors: these entries are written while answering
 *            requests, including failing ones, so a Mongo hiccup here must not turn a rejected
 *            login into a 500. The compliance record is the audit *logger*, which has already
 *            written the same entry by the time this runs; losing the queryable copy degrades the
 *            admin dashboard and nothing else.
 * `void`:    marks the floating call as deliberate, and the `.catch()` is what keeps a rejected
 *            write from surfacing as an unhandled rejection: counted and audit-logged in
 *            production (`app/error-handling.ts`), a failed test under Jest.
 */
const record = (entry: AuditEntry): void => {
    void auditLogRepository.create(entry as Partial<AuditLogDocument>).catch((error: unknown) => {
        // Before the log line, so the count is right even if the logger is what is broken.
        auditSinkFailuresTotal.inc();
        // Stryker disable all
        logger.warn({
            message: 'audit entry not persisted',
            action: entry.action,
            error
        });
        // Stryker restore all
    });
};

/**
 * Read a filtered page of audit entries, newest first.
 *
 * The base `search`, with this collection's policies applied here rather than baked into the
 * repository: `since` and `ownOrder` as scopes (see `sinceScope`, `ownOrderScope`) and a sort this model needs (see
 * {@link AUDIT_SORT}). `meta.totalItems` counts every entry matching the filters, not the page —
 * which is what lets the dashboard say "10 of 3,412" and then page through to the 3,412nd.
 *
 * Rejections propagate, unlike in {@link record}: this one is answering an admin's explicit
 * request for the data, so a failed read is a failed request rather than something to hide.
 */
const search = (filters: AuditLogSearchFilters): Promise<PaginatedResult<AuditEntryItem>> =>
    auditLogRepository.search(
        filters,
        {
            ...auditLogRepository.sinceScope(filters.since),
            ...auditLogRepository.ownOrderScope(filters.ownOrder)
        },
        AUDIT_SORT
    );

/** The attacks-on-a-credential and degraded-endpoint actions the operator sees. Typed, so a rename stops compiling. */
const INCIDENT_ACTIONS = [
    'auth.two_factor.challenge_failed',
    'auth.oauth.failed',
    'auth.refresh_token.reuse_detected',
    'system.webhook_subscription.auto_disabled'
] satisfies readonly AuditAction[];

/**
 * The platform operator's rows, an explicit allow-list: the incidents an installation's operator
 * needs to see, and nothing that names what a shop's customers did. Prefixes alone are wrong —
 * failed logins live under `auth.*`, and `system.user.*` carries customer ids — so each entry
 * below is a decision.
 *
 * - `security.*`: forbidden, a rate limit hit, a step-up demanded, a forged or malformed token, a
 *   revoked key — except the shop's own rank refusals ({@link SHOP_REFUSAL_REASONS}), which are
 *   the shop admin's business. `security.unauthorized` is not stored (a request with no credential,
 *   or a stale one, is a log line and a counter), so no 401 appears here;
 * - `auth.login` only when it FAILED, and the three other signs of an attack on a credential:
 *   a failed second factor, a failed OAuth sign-in, a refresh token replayed;
 * - a webhook subscription disabled for failing.
 *
 * Everything else — orders, payments, products, successful sign-ins — stays on the admin's
 * `GET /audit`.
 */
const INCIDENT_SCOPE: Record<string, unknown> = {
    $nor: [{ action: 'security.forbidden', 'metadata.reason': { $in: SHOP_REFUSAL_REASONS } }],
    $or: [
        { action: { $regex: /^security\./ } },
        { action: 'auth.login', outcome: 'failure' },
        {
            action: {
                $in: INCIDENT_ACTIONS
            }
        }
    ]
};

/**
 * `GET /observability/audit`: the operator's page — {@link INCIDENT_SCOPE} only, every address
 * pseudonymised. `meta.totalItems` counts the incidents matching the filters, not the page.
 *
 * @param filters - the operator's own filters, ANDed with the allow-list
 */
const searchIncidents = (
    filters: AuditLogSearchFilters
): Promise<PaginatedResult<AuditEntryItem>> =>
    auditLogRepository
        .search(
            filters,
            { $and: [INCIDENT_SCOPE, auditLogRepository.sinceScope(filters.since)] },
            AUDIT_SORT
        )
        .then((page) => ({ ...page, items: page.items.map((item) => presentIncidentEntry(item)) }));

/** Entries read per query when an export walks an account's whole trail. */
export const OWN_ENTRIES_PAGE = 500;

/**
 * Every audit entry recorded against this account, actor-only — for the account's own data
 * export. An actor's own rows only: an export that read past the caller would be the exact leak
 * Art. 15 exists to prevent. Unpaginated on purpose: an export is a one-time full answer, not a
 * listing a client pages through. Read by cursor (`ownEntriesPage`), so a long trail costs one
 * pass, not a count and a skip per page.
 *
 * @param userId - the caller's own id
 */
const findOwnAuditEntries = (userId: string): Promise<AuditEntryItem[]> => {
    const entries: AuditEntryItem[] = [];
    const readFrom = (after: OwnEntriesCursor | undefined): Promise<AuditEntryItem[]> =>
        auditLogRepository.ownEntriesPage(userId, after, OWN_ENTRIES_PAGE).then((page) => {
            entries.push(...page.items);
            return page.next ? readFrom(page.next) : entries;
        });

    return readFrom(undefined);
};

/** What the person is told about one consultation of their data: no staff member, only when, what, why. */
export interface Consultation {
    timestamp: string;
    targetType: string;
    targetId: string;
    purpose: string;
}

/** The account export's "who consulted my data" section: the window it covers, and the entries in it. */
export interface Consultations {
    windowDays: number;
    entries: Consultation[];
}

/**
 * Why staff open each kind of record, in words a data subject can read: the "purpose" half of
 * what the person is told when they ask who consulted their data (GDPR Art. 15, CJEU C-579/21
 * gives dates and purposes, not the employee). Also the list of actions that count as a
 * consultation. Each module declares its own (`AppModule.staffReadPurposes`); empty until boot.
 *
 * @see docs/modules/audit-logs.md#the-person-can-see-who-looked
 */
let staffReadPurposes: Readonly<Record<string, string>> = {};

/**
 * Install the merged staff-read purposes, replacing any previous map. Called once at boot from
 * `module.ts`'s `onRegistered`; a test calls it to install a fixture.
 *
 * @param purposes - the enabled modules' declarations, from `resolveStaffReadPurposes`
 */
export const setStaffReadPurposes = (purposes: Readonly<Record<string, string>>): void => {
    staffReadPurposes = purposes;
};

/**
 * Every time staff opened a record about this person, within the retention window, for their own
 * data export (GDPR Art. 15; CJEU C-579/21: the dates and purposes, not the employee).
 *
 * The window is `NODE_AUDIT_RETENTION_DAYS` and the export says so: retention is not extended to
 * answer it. Guests have no `subjectId`, and the orders CSV export names no person: both are
 * stated limits, not gaps.
 *
 * @param userId - the person asking about their own data
 */
const findConsultationsOf = (userId: string): Promise<Consultations> => {
    const windowDays = auditLogsConfig().NODE_AUDIT_RETENTION_DAYS;
    const since = new Date(Date.now() - windowDays * DAY_MS);

    return auditLogRepository
        .consultationsOf(userId, Object.keys(staffReadPurposes), since)
        .then((rows) => ({
            windowDays,
            entries: rows.map((row) => ({
                timestamp: row.timestamp.toISOString(),
                targetType: row.targetType,
                targetId: row.targetId,
                // A row whose action left the map was filtered out by the query: the lookup holds.
                purpose: staffReadPurposes[row.action]
            }))
        }));
};

/**
 * The module's one door — `record` is registered as the audit sink, `search` serves a shop's own
 * staff, `searchIncidents` the platform operator, `findOwnAuditEntries` and `findConsultationsOf`
 * an account's export.
 */
export const auditLogService = {
    record,
    search,
    searchIncidents,
    findOwnAuditEntries,
    findConsultationsOf
};
