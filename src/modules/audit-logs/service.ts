/**
 * @module
 * Audit log service — the persistence sink behind `@infrastructure/observability/audit`, and the
 * read path behind `GET /observability/audit` (the platform operator's view) and `GET /audit`
 * (a tenant staff member's, gated on `audit.any.read`).
 *
 * See: docs/modules/audit-logs.md
 */

import { auditLogRepository, AUDIT_SORT } from './repository';
import type { AuditLogSearchFilters, OwnEntriesCursor } from './repository';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type { AuditEntry } from '@infrastructure/observability/audit';
import type { AuditLogDocument } from './model';
import type { AuditEntryItem } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { auditSinkFailuresTotal } from './metrics';
import { pseudonymise } from '@infrastructure/security/pseudonymise';

/**
 * Store an emitted audit entry. This is the {@link AuditSink} implementation that
 * `@modules/audit-logs/module` registers at import time.
 *
 * Fail-open: fire-and-forget by contract — it returns `void`, and every failure is swallowed into
 *            a log line. Not laziness about errors: these entries are written while answering
 *            requests, including failing ones, so a Mongo hiccup here must not turn a rejected
 *            login into a 500. The compliance record is the audit *logger*, which has already
 *            written the same entry by the time this runs; losing the queryable copy degrades the
 *            admin dashboard and nothing else.
 * `void`:    marks the floating call as deliberate, and the `.catch()` is what keeps a rejected
 *            write from surfacing as an unhandled rejection — which, unlike the failed write,
 *            would genuinely be able to take the process down.
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
 * The base `search`, with this collection's two policies applied here rather than baked into the
 * repository: `since` as a scope (see `sinceScope`) and a sort this model needs (see
 * {@link AUDIT_SORT}). `meta.totalItems` counts every entry matching the filters, not the page —
 * which is what lets the dashboard say "10 of 3,412" and then page through to the 3,412nd.
 *
 * Rejections propagate, unlike in {@link record}: this one is answering an admin's explicit
 * request for the data, so a failed read is a failed request rather than something to hide.
 */
export const search = (filters: AuditLogSearchFilters): Promise<PaginatedResult<AuditEntryItem>> =>
    auditLogRepository.search(filters, auditLogRepository.sinceScope(filters.since), AUDIT_SORT);

/**
 * The `metadata.reason` of a `security.forbidden` row that the shop's own rules wrote
 * (`@modules/access`'s `outrankedRefusal` and `ownMoneyRefusal`): a staff member refused a thing
 * that belongs to an equal, a superior or themselves. Shop business, and `ownerId` names an
 * account, so the operator's view leaves them out; `GET /audit` still shows them.
 */
const SHOP_REFUSAL_REASONS: readonly string[] = ['outranked', 'own'];

/**
 * The platform operator's rows, an explicit allow-list: the incidents an installation's operator
 * needs to see, and nothing that names what a shop's customers did. Prefixes alone are wrong —
 * failed logins live under `auth.*`, and `system.user.*` carries customer ids — so each entry
 * below is a decision.
 *
 * - `security.*`: unauthorized, forbidden, a rate limit hit, a step-up demanded — except the shop's
 *   own rank refusals ({@link SHOP_REFUSAL_REASONS}), which are the shop admin's business;
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
                $in: [
                    'auth.two_factor.challenge_failed',
                    'auth.oauth.failed',
                    'auth.refresh_token.reuse_detected',
                    'system.webhook_subscription.auto_disabled'
                ]
            }
        }
    ]
};

/**
 * An address the operator can correlate but not read: the same keyed, truncated digest the log
 * pipeline writes, so "this address, three incidents" still works across `GET /observability/audit`
 * and the log lines, and the address itself never leaves.
 *
 * @param ip - the stored address
 */
const pseudonymisedIp = (ip: string): string => `hmac:${pseudonymise('log', ip).slice(0, 12)}`;

/**
 * `GET /observability/audit`: the operator's page — {@link INCIDENT_SCOPE} only, every address
 * pseudonymised. `meta.totalItems` counts the incidents matching the filters, not the page.
 *
 * @param filters - the operator's own filters, ANDed with the allow-list
 */
export const searchIncidents = (
    filters: AuditLogSearchFilters
): Promise<PaginatedResult<AuditEntryItem>> =>
    auditLogRepository
        .search(
            filters,
            { $and: [INCIDENT_SCOPE, auditLogRepository.sinceScope(filters.since)] },
            AUDIT_SORT
        )
        .then((page) => ({
            ...page,
            items: page.items.map((item) => ({
                ...item,
                ...(item.ip === undefined ? {} : { ip: pseudonymisedIp(item.ip) })
            }))
        }));

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
export const findOwnAuditEntries = (userId: string): Promise<AuditEntryItem[]> => {
    const entries: AuditEntryItem[] = [];
    const readFrom = (after: OwnEntriesCursor | undefined): Promise<AuditEntryItem[]> =>
        auditLogRepository.ownEntriesPage(userId, after, OWN_ENTRIES_PAGE).then((page) => {
            entries.push(...page.items);
            return page.next ? readFrom(page.next) : entries;
        });

    return readFrom(undefined);
};

/**
 * The module's barrel export — `record` is registered as the audit sink, `search` serves a
 * shop's own staff and `searchIncidents` the platform operator.
 */
export const auditLogService = {
    record,
    search,
    searchIncidents
};
