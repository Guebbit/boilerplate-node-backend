/**
 * @module
 * Who may change whom, through `userService` — the two refusals an admin write owes after the
 * route's own key: the key a CHANGED field needs (`users.any.ban` for `active`), and the rank
 * rule (the account must rank strictly below the caller, the caller's own excepted), plus the
 * ban on changing one's own role.
 *
 * Driven through the service rather than the route so each cell names the caller's role and the
 * owner's level; the route-level matrix is the cross-cutting role-hierarchy suite.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { assignRole, rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { ResponseReject } from '@infrastructure/http/response';
import * as userService from '@modules/users/services';
import { createUser, userRepository } from '@modules/users/tests/factories';

// The audit port is replaced, not spied on — see `tests/support/ports.ts`.
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`; reroute it.
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
const heldRole = (id: string) => rolesOf(id, DEPLOYMENT_TENANT_ID).then(({ tenant }) => tenant);

/** The refusal's first error code, for a result that must be one. */
const refusalCode = (result: { success: boolean }): string | undefined => {
    expect(result.success).toBe(false);
    return (result as ResponseReject).errors[0]?.code;
};

describe('users.any.ban — the key a ban needs', () => {
    it('refuses support a ban, though it may edit the same account', async () => {
        const target = await accountHolding('customer');

        const edit = await userService.updateById(
            target.id,
            { phone: '+39 06 0000 0000' },
            callerContextAs('support')
        );
        const ban = await userService.updateById(
            target.id,
            { active: false },
            callerContextAs('support')
        );

        expect(edit.success).toBe(true);
        expect(refusalCode(ban)).toBe('FORBIDDEN');
        expect(await activeOf(target.id)).toBe(true);
    });

    it('lets a moderator and an admin ban, and lift it', async () => {
        const target = await accountHolding('customer');

        const banned = await userService.updateById(
            target.id,
            { active: false },
            callerContextAs('moderator')
        );
        const lifted = await userService.updateById(
            target.id,
            { active: true },
            callerContextAs('admin')
        );

        expect(banned.success).toBe(true);
        expect(lifted.success).toBe(true);
        expect(await activeOf(target.id)).toBe(true);
    });

    // A PUT carries `active` on every save; resending what the account already has is no ban.
    it('does not ask for the key when `active` is resent unchanged', async () => {
        const target = await accountHolding('customer');

        const result = await userService.updateById(
            target.id,
            { username: 'renamed', active: true },
            callerContextAs('support')
        );

        expect(result.success).toBe(true);
    });

    it('needs every key a mixed body asks for, and writes nothing when one is missing', async () => {
        const target = await accountHolding('customer');

        const result = await userService.updateById(
            target.id,
            { username: 'half-applied', active: false },
            callerContextAs('support')
        );

        expect(refusalCode(result)).toBe('FORBIDDEN');
        expect(await usernameOf(target.id)).not.toBe('half-applied');
    });
});

describe('the rank rule on a user', () => {
    // [caller role, owner role, expected]
    it.each([
        ['support', 'customer', 'allowed'],
        ['support', 'unverified', 'allowed'],
        ['moderator', 'customer', 'allowed'],
        ['admin', 'customer', 'allowed'],
        ['admin', 'moderator', 'allowed'],
        ['support', 'support', 'OUTRANKED'],
        ['support', 'moderator', 'OUTRANKED'],
        ['moderator', 'support', 'OUTRANKED'],
        ['support', 'admin', 'OUTRANKED'],
        ['moderator', 'admin', 'OUTRANKED'],
        ['admin', 'admin', 'OUTRANKED']
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

    it('leaves an outranked account untouched, and records the failed attempt', async () => {
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
                target_type: 'user',
                target_id: owner.id,
                metadata: expect.objectContaining({ reason: 'outranked' })
            })
        );
    });

    it('lets anyone edit their own account, whatever their level', async () => {
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

    it('refuses every shop role the platform operator’s account', async () => {
        const operator = await accountHolding('customer', 'operator-account');
        await assignRole(operator.id, null, 'platform', 'operator');

        const results = await Promise.all(
            ['support', 'moderator', 'admin'].map((role) =>
                userService.updateById(
                    operator.id,
                    { username: `by-${role}` },
                    callerContextAs(role, 'someone-else')
                )
            )
        );

        expect(results.map((result) => refusalCode(result))).toEqual([
            'OUTRANKED',
            'OUTRANKED',
            'OUTRANKED'
        ]);
    });

    it('counts a person holding two roles at the higher one', async () => {
        const both = await accountHolding('support', 'both-roles');
        await assignRole(both.id, null, 'platform', 'operator');

        const result = await userService.updateById(
            both.id,
            { username: 'by-admin' },
            callerContextAs('admin', 'someone-else')
        );

        expect(refusalCode(result)).toBe('OUTRANKED');
    });

    it('applies to a soft delete, a hard delete and a restore', async () => {
        const admin = await accountHolding('admin');
        const moderatorContext = callerContextAs('moderator', 'someone-else');

        const soft = await userService.removeById(admin.id, false, moderatorContext);
        const hard = await userService.removeById(admin.id, true, moderatorContext);
        const restore = await userService.restoreById(admin.id, moderatorContext);

        expect([soft, hard, restore].map((result) => refusalCode(result))).toEqual([
            'OUTRANKED',
            'OUTRANKED',
            'OUTRANKED'
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

describe('nobody changes their own role', () => {
    it.each(['admin', 'moderator', 'support'])('refuses a %s', async (role) => {
        const self = await accountHolding(role);

        const result = await userService.updateById(
            self.id,
            { role: 'customer' },
            callerContextAs(role, self.id)
        );

        expect(refusalCode(result)).toBe('FORBIDDEN');
        expect(await heldRole(self.id)).toBe(role);
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
