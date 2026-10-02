/**
 * `access:grant` — the console command a fresh deployment uses to create its first owner.
 *
 * Exercises `grantAccess` directly, not the CLI wrapper: `grant-access.ts` parses `process.argv`
 * and connects on import, which a test cannot drive per case — same reasoning as
 * `tests/integration/scripts/db/index-sync.test.ts`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { membershipIn } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { systemCallerContext } from '@kernel/permissions';
import { grantAccess, GrantAccessError } from '../../../../scripts/db/access-grant';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();

describe('grantAccess', () => {
    it("grants a shop role to an existing account's tenant scope", async () => {
        const user = await createUser({ email: 'owner@example.com' });

        await grantAccess('owner@example.com', 'admin', 'tenant');

        const membership = await membershipIn(user.id, DEPLOYMENT_TENANT_ID, 'tenant');
        expect(membership?.role).toBe('admin');
    });

    it('grants a platform role with no shop, tenant-less by definition', async () => {
        const user = await createUser({ email: 'operator@example.com' });

        await grantAccess('operator@example.com', 'operator', 'platform');

        const membership = await membershipIn(user.id, null, 'platform');
        expect(membership?.role).toBe('operator');
    });

    it('refuses an email nobody signed up with', async () => {
        await expect(grantAccess('nobody@example.com', 'admin', 'tenant')).rejects.toThrow(
            GrantAccessError
        );
    });

    it("refuses a role no module declares — assignRole's own invariant, not this script's", async () => {
        await createUser({ email: 'someone@example.com' });

        await expect(
            grantAccess('someone@example.com', 'not-a-real-role', 'tenant')
        ).rejects.toThrow(/is not a role/);
    });
});

describe('grantAccess, audited as a console action', () => {
    it('records the grant against the system caller when a context is passed', async () => {
        const audit = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'owner@example.com' });

        await grantAccess('owner@example.com', 'admin', 'tenant', systemCallerContext('User'));

        expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'access.role.assigned',
                outcome: 'success',
                target_id: user.id,
                metadata: expect.objectContaining({ role: 'admin' }) as unknown
            })
        );
    });

    it('records nothing when no context is passed', async () => {
        const audit = observePort(auditPort.emitAuditEvent);
        await createUser({ email: 'owner@example.com' });

        await grantAccess('owner@example.com', 'admin', 'tenant');

        expect(audit).not.toHaveBeenCalled();
    });
});
