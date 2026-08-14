import { setupTestDb } from '@tests/setup-test-db';
import { auditLogRepository } from '@modules/audit-logs';
import { coreAuditActions, type AuditEntry } from '@infrastructure/observability/audit';
import type { AuditLogDocument } from '@modules/audit-logs';

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
            const { items, total } = await auditLogRepository.search({});

            expect(total).toBe(3);
            expect(items.map((item) => item.action)).toEqual([
                coreAuditActions.SECURITY_FORBIDDEN,
                coreAuditActions.SECURITY_RATE_LIMIT_HIT,
                coreAuditActions.SECURITY_UNAUTHORIZED
            ]);
        });

        it('filters by actor', async () => {
            const { items, total } = await auditLogRepository.search({ actor: 'user-2' });

            expect(total).toBe(2);
            expect(items.every((item) => item.actor_user_id === 'user-2')).toBe(true);
        });

        it('filters by action and by outcome', async () => {
            const byAction = await auditLogRepository.search({
                action: coreAuditActions.SECURITY_RATE_LIMIT_HIT
            });
            expect(byAction.total).toBe(1);

            const byOutcome = await auditLogRepository.search({ outcome: 'failure' });
            expect(byOutcome.total).toBe(1);
            expect(byOutcome.items[0].action).toBe(coreAuditActions.SECURITY_RATE_LIMIT_HIT);
        });

        it('applies `since` as an exclusive lower bound on timestamp', async () => {
            // Exactly the second entry's own timestamp — it must be excluded, matching the `>`
            // the ring buffer used, so paging by "the newest timestamp I already have" cannot
            // return that entry a second time.
            const { items, total } = await auditLogRepository.search({
                since: new Date('2026-08-02T10:00:00.000Z')
            });

            expect(total).toBe(1);
            expect(items[0].action).toBe(coreAuditActions.SECURITY_FORBIDDEN);
        });

        it('combines filters rather than replacing them', async () => {
            const { total } = await auditLogRepository.search({
                actor: 'user-2',
                outcome: 'success'
            });

            expect(total).toBe(1);
        });

        it('counts every match while returning only the requested page', async () => {
            // The distinction the admin dashboard renders as "1 of 3": a page size must not
            // silently become the reported total.
            const { items, total } = await auditLogRepository.search({ limit: 1 });

            expect(items).toHaveLength(1);
            expect(total).toBe(3);
        });

        it('drops _id and __v, and returns timestamp as an ISO-8601 string', async () => {
            const { items } = await auditLogRepository.search({ limit: 1 });
            const item = items[0] as unknown as Record<string, unknown>;

            expect(item._id).toBeUndefined();
            expect(item.__v).toBeUndefined();
            // `format: date-time` in openapi.yaml — a raw Date would serialize the same over JSON,
            // but the admin table reads this field directly.
            expect(item.timestamp).toBe('2026-08-03T10:00:00.000Z');
        });

        it('returns an empty page and a zero total when nothing matches', async () => {
            const { items, total } = await auditLogRepository.search({ actor: 'nobody' });

            expect(items).toEqual([]);
            expect(total).toBe(0);
        });
    });
});
