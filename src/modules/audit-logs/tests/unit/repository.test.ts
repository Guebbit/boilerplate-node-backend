import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { auditLogRepository, AUDIT_SORT } from '@modules/audit-logs/repository';
import { coreAuditActions, type AuditEntry } from '@infrastructure/observability/audit';
import type { AuditLogDocument } from '@modules/audit-logs/model';

setupTestDb();

/** A complete entry, shaped exactly as `emitAuditEvent` hands one to the sink. */
const makeEntry = (overrides: Partial<AuditEntry> = {}): Partial<AuditLogDocument> =>
    ({
        actor_user_id: 'user-1',
        actor_role: 'user',
        action: coreAuditActions.SECURITY_UNAUTHORIZED,
        outcome: 'success',
        timestamp: new Date('2026-08-01T10:00:00.000Z'),
        level: 'info',
        ...overrides
    }) as Partial<AuditLogDocument>;

/*
 * Every fixture below uses `coreAuditActions`, never a domain's.
 *
 * The action vocabulary is a union assembled from the enabled modules, so a spec that reaches for
 * `admin.product.created` stops compiling the day `products` is deleted — and this module has no
 * opinion about products. Core's three security actions are the only ones guaranteed to exist in
 * any build, which makes them the right sample data for the module that merely stores them.
 */
/*
 * The repository exposes the BASE `search` — the same three arguments every other collection
 * takes. `since` and the sort are policy the service applies, so they are passed explicitly here
 * rather than assumed.
 */
const search = (filters: Parameters<typeof auditLogRepository.search>[0] = {}, since?: Date) =>
    auditLogRepository.search(filters, auditLogRepository.sinceScope(since), AUDIT_SORT);

describe('auditLogRepository', () => {
    describe('create', () => {
        it('stores an entry with every optional context field', async () => {
            const stored = await auditLogRepository.create(
                makeEntry({
                    ip: '203.0.113.4',
                    user_agent: 'Mozilla/5.0',
                    request_id: 'req-1',
                    trace_id: 'trace-1',
                    target_type: 'session',
                    target_id: 'sess-9',
                    metadata: { hardDelete: true }
                })
            );

            expect(stored.ip).toBe('203.0.113.4');
            expect(stored.target_id).toBe('sess-9');
            expect(stored.metadata?.hardDelete).toBe(true);
        });

        it('rejects an entry missing a required field', async () => {
            const incomplete = {
                action: coreAuditActions.SECURITY_UNAUTHORIZED
            } as Partial<AuditLogDocument>;

            await expect(auditLogRepository.create(incomplete)).rejects.toThrow();
        });
    });

    describe('search', () => {
        beforeEach(async () => {
            await auditLogRepository.create(
                makeEntry({ timestamp: new Date('2026-08-01T10:00:00.000Z') })
            );
            await auditLogRepository.create(
                makeEntry({
                    actor_user_id: 'user-2',
                    action: coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                    outcome: 'failure',
                    level: 'warn',
                    timestamp: new Date('2026-08-02T10:00:00.000Z')
                })
            );
            await auditLogRepository.create(
                makeEntry({
                    actor_user_id: 'user-2',
                    action: coreAuditActions.SECURITY_FORBIDDEN,
                    timestamp: new Date('2026-08-03T10:00:00.000Z')
                })
            );
        });

        it('returns every entry newest first when unfiltered', async () => {
            const { items, meta } = await search();

            expect(meta.totalItems).toBe(3);
            expect(items.map((item) => item.action)).toEqual([
                coreAuditActions.SECURITY_FORBIDDEN,
                coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                coreAuditActions.SECURITY_UNAUTHORIZED
            ]);
        });

        it('filters by actor', async () => {
            const { items, meta } = await search({ actor: 'user-2' });

            expect(meta.totalItems).toBe(2);
            expect(items.every((item) => item.actor_user_id === 'user-2')).toBe(true);
        });

        it('filters by action and by outcome', async () => {
            const byAction = await search({
                action: coreAuditActions.SECURITY_RATE_LIMIT_HIT
            });
            expect(byAction.meta.totalItems).toBe(1);

            const byOutcome = await search({ outcome: 'failure' });
            expect(byOutcome.meta.totalItems).toBe(1);
            expect(byOutcome.items[0].action).toBe(coreAuditActions.SECURITY_RATE_LIMIT_HIT);
        });

        it('applies `since` as an exclusive lower bound on timestamp', async () => {
            // Exactly the second entry's own timestamp — it must be excluded, matching the `>`
            // the ring buffer uses, so paging by "the newest timestamp I already have" cannot
            // return that entry a second time.
            const { items, meta } = await search({}, new Date('2026-08-02T10:00:00.000Z'));

            expect(meta.totalItems).toBe(1);
            expect(items[0].action).toBe(coreAuditActions.SECURITY_FORBIDDEN);
        });

        it('keeps the `since` bound a Date rather than coercing it with Number()', async () => {
            // The reason `since` rides in `scope`: the search spec's ranges coerce their bounds
            // with `Number()`, which turns a Date into a timestamp Mongo will not compare.
            const { meta } = await search({}, new Date('2026-07-01T00:00:00.000Z'));

            expect(meta.totalItems).toBe(3);
        });

        it('combines filters rather than replacing them', async () => {
            const { meta } = await search({ actor: 'user-2', outcome: 'success' });

            expect(meta.totalItems).toBe(1);
        });

        it('counts every match while returning only the requested page', async () => {
            // The distinction the admin dashboard renders as "1 of 3": a page size must not
            // silently become the reported total.
            const { items, meta } = await search({ pageSize: 1 });

            expect(items).toHaveLength(1);
            expect(meta).toEqual({ page: 1, pageSize: 1, totalItems: 3, totalPages: 3 });
        });

        it('drops _id and __v, and returns timestamp as an ISO-8601 string', async () => {
            const { items } = await search({ pageSize: 1 });
            const item = asStub<Record<string, unknown>>(items[0]);

            expect(item._id).toBeUndefined();
            expect(item.__v).toBeUndefined();
            // `format: date-time` in openapi.yaml — a raw Date would serialize the same over JSON,
            // but the admin table reads this field directly.
            expect(item.timestamp).toBe('2026-08-03T10:00:00.000Z');
        });

        it('returns an empty page and a zero total when nothing matches', async () => {
            const { items, meta } = await search({ actor: 'nobody' });

            expect(items).toEqual([]);
            expect(meta.totalItems).toBe(0);
        });
    });

    /*
     * A trail that counts what it cannot serve is not a trail.
     *
     * This read was capped at 200 rows while still reporting the true total, so a deployment with
     * 3,412 entries rendered "200 of 3,412" and no request returned the 201st. These cases fail
     * against any read that caps instead of pages.
     */
    describe('deep paging', () => {
        const TOTAL = 205;
        const EPOCH = Date.parse('2026-08-01T00:00:00.000Z');

        beforeEach(async () => {
            // Distinct timestamps a minute apart, so "newest first" has one right answer and the
            // request id says which row a page actually returned.
            await Promise.all(
                Array.from({ length: TOTAL }, (_, index) =>
                    auditLogRepository.create(
                        makeEntry({
                            request_id: `entry-${index}`,
                            timestamp: new Date(EPOCH + index * 60_000)
                        })
                    )
                )
            );
        });

        it('serves row 201 and reports how many pages remain', async () => {
            const { items, meta } = await auditLogRepository.search(
                { page: 21, pageSize: 10 },
                {},
                AUDIT_SORT
            );

            expect(meta).toEqual({ page: 21, pageSize: 10, totalItems: TOTAL, totalPages: 21 });
            // Newest first, so rows 201-205 are the five oldest entries — the ones the capped
            // read counted and refused to send.
            expect(items.map((item) => item.request_id)).toEqual([
                'entry-4',
                'entry-3',
                'entry-2',
                'entry-1',
                'entry-0'
            ]);
        });

        it('never returns the same entry on two pages', async () => {
            // `timestamp` alone is not unique across a bulk write; `AUDIT_SORT` adds `_id` so the
            // count and the page cannot disagree about the tie order.
            const pages = await Promise.all(
                [1, 2, 3].map((page) =>
                    auditLogRepository.search({ page, pageSize: 100 }, {}, AUDIT_SORT)
                )
            );
            const seen = pages.flatMap(({ items }) => items.map((item) => item.request_id));

            expect(seen).toHaveLength(TOTAL);
            expect(new Set(seen).size).toBe(TOTAL);
        });
    });
});
