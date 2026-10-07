/**
 * @module
 * What the platform operator's audit read shows: the incident allow-list, and nothing that names
 * what a shop's customers did. Each row below is a decision — a prefix alone would be wrong
 * (failed logins live under `auth.*`, `system.user.*` carries customer ids) — so the allowed and
 * the withheld are both pinned, with their action strings spelled out. Addresses leave only as a
 * keyed digest.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { auditLogService } from '@modules/audit-logs/service';
import { auditLogRepository } from '@modules/audit-logs/repository';
import type { AuditLogDocument } from '@modules/audit-logs/model';

setupTestDb();

/** One stored row, with the fields a filter reads. */
const row = (
    action: string,
    outcome: 'success' | 'failure',
    extra: Partial<AuditLogDocument> = {}
): Partial<AuditLogDocument> => ({
    actor_user_id: 'user-1',
    actor_role: 'user',
    action,
    outcome,
    timestamp: new Date(),
    level: outcome === 'failure' ? 'warn' : 'info',
    ...extra
});

/** Seeds one row per `[action, outcome]` pair. */
const seed = (rows: [string, 'success' | 'failure'][]) =>
    Promise.all(rows.map(([action, outcome]) => auditLogRepository.create(row(action, outcome))));

/** The `action:outcome` of everything the operator's read returns, sorted. */
const seenByOperator = () =>
    auditLogService
        .searchIncidents({})
        .then((page) => page.items.map((item) => `${item.action}:${item.outcome}`).toSorted());

describe('the operator’s audit read — what it shows', () => {
    it('shows the security refusals, a failed sign-in and the signs of an attack on a credential', async () => {
        await seed([
            ['security.unauthorized', 'failure'],
            ['security.forbidden', 'failure'],
            ['security.rate_limit_hit', 'failure'],
            ['security.reauth_required', 'failure'],
            ['auth.login', 'failure'],
            ['auth.two_factor.challenge_failed', 'failure'],
            ['auth.oauth.failed', 'failure'],
            ['auth.refresh_token.reuse_detected', 'failure'],
            ['system.webhook_subscription.auto_disabled', 'failure']
        ]);

        expect(await seenByOperator()).toEqual([
            'auth.login:failure',
            'auth.oauth.failed:failure',
            'auth.refresh_token.reuse_detected:failure',
            'auth.two_factor.challenge_failed:failure',
            'security.forbidden:failure',
            'security.rate_limit_hit:failure',
            'security.reauth_required:failure',
            'security.unauthorized:failure',
            'system.webhook_subscription.auto_disabled:failure'
        ]);
    });
});

describe('the operator’s audit read — what it withholds', () => {
    it('withholds a successful sign-in, though the failed one is shown', async () => {
        await seed([
            ['auth.login', 'success'],
            ['auth.login', 'failure']
        ]);

        expect(await seenByOperator()).toEqual(['auth.login:failure']);
    });

    it('withholds everything a shop’s customers did and an admin did to them', async () => {
        await seed([
            ['order.created', 'success'],
            ['order.cancelled', 'success'],
            ['payment.confirmed', 'success'],
            ['admin.product.updated', 'success'],
            ['admin.user.banned', 'success'],
            ['system.user.erased', 'success'],
            ['system.user.soft_deleted', 'success'],
            ['auth.signup', 'success'],
            ['auth.password.changed', 'success'],
            ['access.role.assigned', 'success']
        ]);

        expect(await seenByOperator()).toEqual([]);
    });

    // The shop's own rank refusals name an account (`ownerId`) and are the shop admin's business.
    it('withholds a forbidden row the shop’s rank rule wrote, and keeps every other forbidden', async () => {
        await Promise.all(
            ['outranked', 'own', 'own_role', undefined].map((reason, index) =>
                auditLogRepository.create(
                    row('security.forbidden', 'failure', {
                        request_id: `forbidden-${index}`,
                        metadata: reason === undefined ? undefined : { reason, ownerId: 'owner-1' }
                    })
                )
            )
        );

        const { items } = await auditLogService.searchIncidents({});

        expect(items.map((item) => item.request_id).toSorted()).toEqual([
            'forbidden-2',
            'forbidden-3'
        ]);
    });

    it('counts only incidents, so a page total never leaks how much else there is', async () => {
        await seed([
            ['order.created', 'success'],
            ['order.created', 'success'],
            ['security.forbidden', 'failure']
        ]);

        const page = await auditLogService.searchIncidents({});

        expect(page.meta.totalItems).toBe(1);
    });

    it('ANDs the operator’s own filters with the allow-list, never widening it', async () => {
        await seed([
            ['order.created', 'success'],
            ['security.forbidden', 'failure']
        ]);

        const asked = await auditLogService.searchIncidents({ action: 'order.created' });

        expect(asked.items).toEqual([]);
    });
});

describe('the operator’s audit read — addresses', () => {
    it('gives a keyed digest in place of the address, the same for the same address', async () => {
        await Promise.all([
            auditLogRepository.create(
                row('security.forbidden', 'failure', { ip: '203.0.113.4', request_id: 'a' })
            ),
            auditLogRepository.create(
                row('security.forbidden', 'failure', { ip: '203.0.113.4', request_id: 'b' })
            ),
            auditLogRepository.create(
                row('security.forbidden', 'failure', { ip: '198.51.100.9', request_id: 'c' })
            )
        ]);

        const { items } = await auditLogService.searchIncidents({});
        const ips = items.map((item) => item.ip);

        expect(ips.every((ip) => /^hmac:[\da-f]{12}$/.test(String(ip)))).toBe(true);
        expect(ips.join(' ')).not.toContain('203.0.113.4');
        expect(new Set(ips).size).toBe(2);
    });

    it('leaves a row with no address as it is', async () => {
        await seed([['security.forbidden', 'failure']]);

        const { items } = await auditLogService.searchIncidents({});

        expect(items[0]).not.toHaveProperty('ip');
    });

    it('does not change what the admin’s own read returns', async () => {
        await auditLogRepository.create(row('order.created', 'success', { ip: '203.0.113.4' }));

        const { items } = await auditLogService.search({});

        expect(items[0].ip).toBe('203.0.113.4');
    });
});
