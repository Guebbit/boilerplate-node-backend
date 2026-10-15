/**
 * @module
 * The protection of staff accounts in isolation: `holdsStaffRole` reads whether an account holds a
 * role off its memberships, and `canChangeAccount` / `roleProtectedRefusal` let only a holder of
 * `assign:Role` change one. The membership rows are a table here, so every cell is a pure
 * case; the same rule through real routes and a real database is the integration users suite.
 */

import { callerContextAs, testCallerContext } from '@tests/callers';
import { systemCallerContext } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import {
    canChangeAccount,
    holdsStaffRole,
    ownOrderFlag,
    roleProtectedRefusal,
    staffHoldersAmong
} from '../../services';

/** One membership row, as the repository returns it. */
interface Row {
    userId: string;
    tenantId: string | null;
    role: string;
    scope: 'tenant' | 'platform';
}

/** Who holds what, keyed by user id — what the mocked repository reads. */
const memberships = new Map<string, Row[]>();

jest.mock('../../repository', () => ({
    membershipRepository: {
        findByUserId: (userId: string) => Promise.resolve(memberships.get(userId) ?? []),
        findByUserIds: (userIds: string[], tenantId: string | null, scope: string) =>
            Promise.resolve(
                userIds
                    .flatMap((id) => memberships.get(id) ?? [])
                    .filter((row) => row.scope === scope && row.tenantId === tenantId)
            )
    },
    tenantRepository: {}
}));

/** Records an audit row instead of writing one. */
const recorded: unknown[] = [];

jest.mock('@infrastructure/observability/audit', () => ({
    ...jest.requireActual('@infrastructure/observability/audit'),
    recordAudit: (_context: unknown, fields: unknown) => {
        recorded.push(fields);
    }
}));

/** Gives `userId` a tenant role, and optionally a platform one. */
const hold = (userId: string, tenant: string | null, platform?: string): void => {
    memberships.set(userId, [
        ...(tenant === null
            ? []
            : [{ userId, tenantId: DEPLOYMENT_TENANT_ID, role: tenant, scope: 'tenant' as const }]),
        ...(platform === undefined
            ? []
            : [{ userId, tenantId: null, role: platform, scope: 'platform' as const }])
    ]);
};

beforeEach(() => {
    memberships.clear();
    recorded.length = 0;
});

describe('holdsStaffRole', () => {
    it.each(['manager', 'warehouse', 'support', 'editor', 'moderator', 'admin'])(
        'reads a %s as holding a staff role',
        async (role) => {
            hold('owner', role);

            expect(await holdsStaffRole('owner')).toBe(true);
        }
    );

    it('reads the platform operator, holding no shop role at all, as holding one', async () => {
        hold('owner', null, 'operator');

        expect(await holdsStaffRole('owner')).toBe(true);
    });

    it('reads a person with no membership as a plain customer', async () => {
        expect(await holdsStaffRole('nobody')).toBe(false);
    });
});

describe('staffHoldersAmong', () => {
    it('answers which of a page of people hold a role, in either scope', async () => {
        hold('staff', 'support');
        hold('operator', null, 'operator');

        expect(await staffHoldersAmong(['staff', 'operator', 'customer'])).toEqual(
            new Set(['staff', 'operator'])
        );
    });
});

describe('canChangeAccount', () => {
    // [caller role, account holds, expected]
    it.each([
        ['a customer account, by support', 'support', null, true],
        ['a staff account, by support', 'support', 'moderator', false],
        ['an admin account, by a moderator', 'moderator', 'admin', false],
        ['a staff account, by an admin', 'admin', 'support', true],
        ['another admin, by an admin', 'admin', 'admin', true],
        ['a platform-only account, by a moderator', 'moderator', 'operator', false]
    ])('%s', async (_row, callerRole, ownerRole, expected) => {
        if (ownerRole === 'operator') hold('owner', null, 'operator');
        else hold('owner', ownerRole);

        expect(await canChangeAccount(callerContextAs(callerRole, 'caller'), 'owner')).toBe(
            expected
        );
    });

    it('lets the caller change their own account, whatever they hold', async () => {
        hold('me', 'support');

        expect(await canChangeAccount(callerContextAs('support', 'me'), 'me')).toBe(true);
    });

    it('skips the check for a missing context and the system actor', async () => {
        hold('owner', 'admin');

        expect(await canChangeAccount(undefined, 'owner')).toBe(true);
        expect(await canChangeAccount(systemCallerContext('User'), 'owner')).toBe(true);
    });

    it('treats a stranger as protecting nobody from staff accounts', async () => {
        hold('owner', 'support');

        expect(await canChangeAccount(testCallerContext, 'owner')).toBe(false);
    });
});

describe('roleProtectedRefusal', () => {
    it('answers nothing when the account is a customer', async () => {
        expect(await roleProtectedRefusal(callerContextAs('support', 'caller'), 'owner')).toBe(
            undefined
        );
        expect(recorded).toEqual([]);
    });

    it('answers a 403 ROLE_MANAGEMENT_REQUIRED and records a failed security.forbidden', async () => {
        hold('owner', 'admin');

        const refusal = await roleProtectedRefusal(callerContextAs('support', 'caller'), 'owner');

        expect(refusal).toMatchObject({
            success: false,
            status: 403,
            errors: [{ code: 'ROLE_MANAGEMENT_REQUIRED' }]
        });
        expect(recorded).toEqual([
            {
                action: 'security.forbidden',
                outcome: 'failure',
                targetType: 'user',
                targetId: 'owner',
                metadata: { reason: 'role_protected' }
            }
        ]);
    });
});

describe('ownOrderFlag', () => {
    it('flags the caller’s own order, and only that', () => {
        const me = callerContextAs('admin', 'me');

        expect(ownOrderFlag(me, 'me')).toEqual({ ownOrder: true });
        expect(ownOrderFlag(me, 'someone-else')).toEqual({});
        expect(ownOrderFlag(me, undefined)).toEqual({});
        expect(ownOrderFlag(undefined, 'me')).toEqual({});
        expect(ownOrderFlag(systemCallerContext('Order'), 'system')).toEqual({});
    });
});
