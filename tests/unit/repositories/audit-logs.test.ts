import { setupTestDb } from '../../helpers/setup-test-db';
import { auditLogRepository } from '@repositories/audit-logs';
import { AuditAction, type IAuditEntry } from '@core/observability/audit';
import type { IAuditLogDocument } from '@models/audit-logs';

setupTestDb();

/** A complete entry, shaped exactly as `emitAuditEvent` hands one to the sink. */
const makeEntry = (overrides: Partial<IAuditEntry> = {}): Partial<IAuditLogDocument> =>
    ({
        actor_user_id: 'user-1',
        actor_role: 'user',
        action: AuditAction.AUTH_LOGIN_SUCCEEDED,
        outcome: 'success',
        timestamp: new Date('2026-08-01T10:00:00.000Z'),
        level: 'info',
        ...overrides
    }) as Partial<IAuditLogDocument>;

describe('auditLogRepository', () => {
    describe('create', () => {
        it('stores an entry with every optional context field', async () => {
            const stored = await auditLogRepository.create(
                makeEntry({
                    ip: '203.0.113.4',
                    user_agent: 'Mozilla/5.0',
                    request_id: 'req-1',
                    trace_id: 'trace-1',
                    target_type: 'product',
                    target_id: 'prod-9',
                    metadata: { hardDelete: true }
                })
            );

            expect(stored.ip).toBe('203.0.113.4');
            expect(stored.target_id).toBe('prod-9');
            expect(stored.metadata?.hardDelete).toBe(true);
        });

        it('rejects an entry missing a required field', async () => {
            const incomplete = {
                action: AuditAction.AUTH_LOGIN_SUCCEEDED
            } as Partial<IAuditLogDocument>;

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
                    action: AuditAction.AUTH_LOGIN_FAILED,
                    outcome: 'failure',
                    level: 'warn',
                    timestamp: new Date('2026-08-02T10:00:00.000Z')
                })
            );
            await auditLogRepository.create(
                makeEntry({
                    actor_user_id: 'user-2',
                    action: AuditAction.ADMIN_PRODUCT_CREATED,
                    timestamp: new Date('2026-08-03T10:00:00.000Z')
                })
            );
        });

        it('returns every entry newest first when unfiltered', async () => {
            const { items, total } = await auditLogRepository.search({});

            expect(total).toBe(3);
            expect(items.map((item) => item.action)).toEqual([
                'admin.product.created',
                'auth.login.failed',
                'auth.login.succeeded'
            ]);
        });

        it('filters by actor', async () => {
            const { items, total } = await auditLogRepository.search({ actor: 'user-2' });

            expect(total).toBe(2);
            expect(items.every((item) => item.actor_user_id === 'user-2')).toBe(true);
        });

        it('filters by action and by outcome', async () => {
            const byAction = await auditLogRepository.search({
                action: AuditAction.AUTH_LOGIN_FAILED
            });
            expect(byAction.total).toBe(1);

            const byOutcome = await auditLogRepository.search({ outcome: 'failure' });
            expect(byOutcome.total).toBe(1);
            expect(byOutcome.items[0].action).toBe('auth.login.failed');
        });

        it('applies `since` as an exclusive lower bound on timestamp', async () => {
            // Exactly the second entry's own timestamp — it must be excluded, matching the `>`
            // the ring buffer used, so paging by "the newest timestamp I already have" cannot
            // return that entry a second time.
            const { items, total } = await auditLogRepository.search({
                since: new Date('2026-08-02T10:00:00.000Z')
            });

            expect(total).toBe(1);
            expect(items[0].action).toBe('admin.product.created');
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
