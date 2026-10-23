/**
 * @module
 * Who may change whom, through `userService` — the refusals an admin write owes after the
 * route's own key: the protection of an account that holds a staff role (only a holder of
 * `assign:Role` may change one, the
 * caller's own excepted), and the same key for handing a role out.
 *
 * Driven through the service rather than the route so each cell names the caller's role and what
 * the account holds; the route-level matrix is the cross-cutting account-protection suite.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { ResponseReject } from '@infrastructure/http/response';
import { userService } from '@modules/users/services';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { seedMembership } from '@modules/access/tests/factories';

// The audit port is replaced, not spied on — see `tests/support/ports.ts`.
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

/** Creates an account holding `role` in the shop, with a distinct address per call. */
const accountHolding = (role: string, name = role) =>
    createUser({ email: `${name}@owner.test`, username: name }, role);

/** What the stored account says now — a refusal must leave it exactly as it was. */
const stored = (id: string) => userRepository.findById(id);

/** The stored `active` flag. */
const activeOf = (id: string) => stored(id).then((user) => user?.active);

/** The stored username. */
const usernameOf = (id: string) => stored(id).then((user) => user?.username);

/** The tenant role the account holds now. */
const heldRole = (id: string) =>
    accessService.rolesOf(id, DEPLOYMENT_TENANT_ID).then(({ tenant }) => tenant);

/** The refusal's first error code, for a result that must be one. */
const refusalCode = (result: { success: boolean }): string | undefined => {
    expect(result.success).toBe(false);
    return (result as ResponseReject).errors[0]?.code;
};

describe('activate and deactivate', () => {
    it('lets a moderator deactivate and an admin activate', async () => {
        const target = await accountHolding('customer');

        const deactivated = await userService.deactivate(target.id, callerContextAs('moderator'));
        const wasActive = await activeOf(target.id);
        const activated = await userService.activate(target.id, callerContextAs('admin'));

        expect(deactivated.success).toBe(true);
        expect(wasActive).toBe(false);
        expect(activated.success).toBe(true);
        expect(await activeOf(target.id)).toBe(true);
    });

    it('refuses a repeat with the code of the state it is already in', async () => {
        const target = await accountHolding('customer');

        const activeAgain = await userService.activate(target.id, callerContextAs('moderator'));
        await userService.deactivate(target.id, callerContextAs('moderator'));
        const inactiveAgain = await userService.deactivate(target.id, callerContextAs('moderator'));

        expect(activeAgain).toMatchObject({ success: false, status: 409 });
        expect(refusalCode(activeAgain)).toBe('USER_ALREADY_ACTIVE');
        expect(inactiveAgain).toMatchObject({ success: false, status: 409 });
        expect(refusalCode(inactiveAgain)).toBe('USER_ALREADY_INACTIVE');
    });

    it('answers 404 for an account that does not exist', async () => {
        const result = await userService.deactivate(
            '64b64b64b64b64b64b64b64b',
            callerContextAs('moderator')
        );

        expect(result).toMatchObject({ success: false, status: 404 });
    });

    it('leaves a protected account as it was, for a caller without role management', async () => {
        const admin = await accountHolding('admin');

        const result = await userService.deactivate(admin.id, callerContextAs('moderator', 'else'));

        expect(refusalCode(result)).toBe('ROLE_MANAGEMENT_REQUIRED');
        expect(await activeOf(admin.id)).toBe(true);
    });
});

describe('the protection of staff accounts', () => {
    // [caller role, account holds, expected]
    it.each([
        ['support', 'customer', 'allowed'],
        ['support', 'unverified', 'allowed'],
        ['moderator', 'customer', 'allowed'],
        ['admin', 'customer', 'allowed'],
        ['admin', 'moderator', 'allowed'],
        ['admin', 'admin', 'allowed'],
        ['support', 'support', 'ROLE_MANAGEMENT_REQUIRED'],
        ['support', 'moderator', 'ROLE_MANAGEMENT_REQUIRED'],
        ['moderator', 'support', 'ROLE_MANAGEMENT_REQUIRED'],
        ['support', 'admin', 'ROLE_MANAGEMENT_REQUIRED'],
        ['moderator', 'admin', 'ROLE_MANAGEMENT_REQUIRED']
    ])('%s editing a %s: %s', async (callerRole, ownerRole, expected) => {
        const owner = await accountHolding(ownerRole, 'owner');

        const result = await userService.updateById(
            owner.id,
            { username: 'edited' },
            callerContextAs(callerRole, 'someone-else')
        );

        if (expected === 'allowed') expect(result.success).toBe(true);
        else expect(refusalCode(result)).toBe(expected);
    });

    it('leaves a protected account untouched, and records the failed attempt', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const owner = await accountHolding('admin');

        await userService.updateById(
            owner.id,
            { username: 'taken-over' },
            callerContextAs('moderator', 'someone-else')
        );

        expect(await usernameOf(owner.id)).not.toBe('taken-over');
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'security.forbidden',
                outcome: 'failure',
                targetType: 'user',
                targetId: owner.id,
                metadata: expect.objectContaining({ reason: 'role_protected' })
            })
        );
    });

    it('lets anyone edit their own account, whatever they hold', async () => {
        const admin = await accountHolding('admin');
        const support = await accountHolding('support');

        const own = await Promise.all([
            userService.updateById(
                admin.id,
                { username: 'me-admin' },
                callerContextAs('admin', admin.id)
            ),
            userService.updateById(
                support.id,
                { username: 'me-support' },
                callerContextAs('support', support.id)
            )
        ]);

        expect(own.map((result) => result.success)).toEqual([true, true]);
    });

    it('refuses every role but a role manager the platform operator’s account', async () => {
        const operator = await accountHolding('customer', 'operator-account');
        await seedMembership(operator.id, null, 'platform', 'operator');

        const results = await Promise.all(
            ['support', 'moderator', 'admin'].map((role) =>
                userService.updateById(
                    operator.id,
                    { username: `by-${role}` },
                    callerContextAs(role, 'someone-else')
                )
            )
        );

        expect(results.map((result) => (result.success ? 'allowed' : refusalCode(result)))).toEqual(
            ['ROLE_MANAGEMENT_REQUIRED', 'ROLE_MANAGEMENT_REQUIRED', 'allowed']
        );
    });

    it('protects an account holding a role in either scope', async () => {
        const both = await accountHolding('support', 'both-roles');
        await seedMembership(both.id, null, 'platform', 'operator');

        const result = await userService.updateById(
            both.id,
            { username: 'by-moderator' },
            callerContextAs('moderator', 'someone-else')
        );

        expect(refusalCode(result)).toBe('ROLE_MANAGEMENT_REQUIRED');
    });

    it('applies to a soft delete, a hard delete and a restore', async () => {
        const admin = await accountHolding('admin');
        const moderatorContext = callerContextAs('moderator', 'someone-else');

        const soft = await userService.removeById(admin.id, false, moderatorContext);
        const hard = await userService.removeById(admin.id, true, moderatorContext);
        const restore = await userService.restoreById(admin.id, moderatorContext);

        expect([soft, hard, restore].map((result) => refusalCode(result))).toEqual([
            'ROLE_MANAGEMENT_REQUIRED',
            'ROLE_MANAGEMENT_REQUIRED',
            'ROLE_MANAGEMENT_REQUIRED'
        ]);
        expect(await stored(admin.id)).not.toBeNull();
    });

    it('lets a moderator erase a customer', async () => {
        const customer = await accountHolding('customer');

        const result = await userService.removeById(
            customer.id,
            false,
            callerContextAs('moderator', 'someone-else')
        );

        expect(result.success).toBe(true);
    });
});

describe('handing out a staff role', () => {
    it('refuses a caller without role management, and writes nothing', async () => {
        const target = await accountHolding('customer');

        const result = await userService.updateById(
            target.id,
            { role: 'support' },
            callerContextAs('moderator', 'someone-else')
        );

        expect(result).toMatchObject({
            success: false,
            status: 403,
            errors: [{ code: 'ROLE_MANAGEMENT_REQUIRED' }]
        });

        expect(await heldRole(target.id)).toBeNull();
    });

    it('lets an administrator grant a role, and take it away', async () => {
        const target = await accountHolding('customer');
        const admin = callerContextAs('admin', 'someone-else');

        const granted = await userService.updateById(target.id, { role: 'support' }, admin);
        const grantedRole = await heldRole(target.id);
        const revoked = await userService.updateById(target.id, { role: null }, admin);

        expect([granted.success, revoked.success]).toEqual([true, true]);
        expect(grantedRole).toBe('support');
        expect(await heldRole(target.id)).toBeNull();
    });

    it('refuses a caller without role management taking a role away', async () => {
        const target = await accountHolding('support');

        const result = await userService.updateById(
            target.id,
            { role: null },
            callerContextAs('moderator', 'someone-else')
        );

        expect(refusalCode(result)).toBe('ROLE_MANAGEMENT_REQUIRED');
        expect(await heldRole(target.id)).toBe('support');
    });

    // A PUT carries `role` on every save; resending the held one changes nothing.
    it('lets a save resend the role already held', async () => {
        const self = await accountHolding('support');

        const result = await userService.updateById(
            self.id,
            { role: 'support', username: 'same-role' },
            callerContextAs('support', self.id)
        );

        expect(result.success).toBe(true);
    });
});
