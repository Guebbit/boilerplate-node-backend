/**
 * @module
 * The one-shop invariant `Caller`'s discriminated union exists to prove: a stranger, the system
 * actor, and any tenant-scope caller all carry the fixed `DEPLOYMENT_TENANT_ID`, never `null` — `null` is
 * platform scope, and only there.
 */
import { anonymousCaller, callerInScope, SYSTEM_ACTOR } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { asOperator, asRole, TEST_TENANT_ID } from '../../support/callers';

describe('anonymousCaller', () => {
    it('browses the one shop, in tenant scope', () => {
        const stranger = anonymousCaller();

        expect(stranger.scope).toBe('tenant');
        expect(stranger.tenantId).toBe(DEPLOYMENT_TENANT_ID);
    });
});

describe('SYSTEM_ACTOR', () => {
    it('carries the one shop rather than no shop', () => {
        expect(SYSTEM_ACTOR.tenantId).toBe(DEPLOYMENT_TENANT_ID);
    });
});

describe('callerInScope', () => {
    it("gives a tenant-scope caller the resolved caller's own tenant id", () => {
        const caller = callerInScope(asRole('customer'), 'tenant');

        expect(caller.scope).toBe('tenant');
        expect(caller.tenantId).toBe(TEST_TENANT_ID);
    });

    it('gives a platform-scope caller no tenant id, even for a caller who also holds a shop role', () => {
        const caller = callerInScope(asOperator(), 'platform');

        expect(caller.scope).toBe('platform');
        expect(caller.tenantId).toBeNull();
    });
});
