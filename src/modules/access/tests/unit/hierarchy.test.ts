/**
 * @module
 * The rank rule in isolation: `levelOfUser` reads an owner's level off their memberships, and
 * `canActOn` / `outrankedRefusal` compare it with the caller's. The membership rows are a table
 * here, so every cell is a pure case; the same rule through real routes and a real database is
 * the cross-cutting role-hierarchy suite.
 */

import type { CallerContext } from '@types';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { systemCallerContext } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { canActOn, levelOfUser, outrankedRefusal } from '../../service';

/** One membership row, as `findByUserId` returns it. */
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
        findByUserId: (userId: string) => Promise.resolve(memberships.get(userId) ?? [])
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

describe('levelOfUser', () => {
    it.each([
        ['customer', 'user'],
        ['unverified', 'user'],
        ['manager', 'staff'],
        ['warehouse', 'staff'],
        ['support', 'staff'],
        ['editor', 'staff'],
        ['moderator', 'staff'],
        ['admin', 'admin']
    ])('reads a %s as %s', async (role, level) => {
        hold('owner', role);

        expect(await levelOfUser('owner')).toBe(level);
    });

    it('reads the platform operator, holding no shop role at all, as admin', async () => {
        hold('owner', null, 'operator');

        expect(await levelOfUser('owner')).toBe('admin');
    });

    it('reads two roles as the higher one', async () => {
        hold('owner', 'support', 'operator');

        expect(await levelOfUser('owner')).toBe('admin');
    });

    it('reads a person with no membership as user', async () => {
        expect(await levelOfUser('nobody')).toBe('user');
    });
});

describe('canActOn — the six rows', () => {
    // [caller role, owner holds, expected]
    it.each([
        ['lower level', 'support', 'customer', true],
        ['same level, someone else', 'support', 'moderator', false],
        ['higher level', 'support', 'admin', false],
        ['an admin on another admin', 'admin', 'admin', false],
        ['staff on a platform-only account', 'support', null, false]
    ])('%s: %s -> %s', async (_row, callerRole, ownerRole, expected) => {
        hold('owner', ownerRole, ownerRole === null ? 'operator' : undefined);

        expect(await canActOn(callerContextAs(callerRole, 'caller'), 'owner')).toBe(expected);
    });

    it('lets the caller change their own thing, whatever they rank', async () => {
        hold('me', 'admin');

        expect(await canActOn(callerContextAs('admin', 'me'), 'me')).toBe(true);
    });

    it('skips the check for a missing context, the system actor and a thing nobody owns', async () => {
        hold('owner', 'admin');

        expect(await canActOn(undefined, 'owner')).toBe(true);
        expect(await canActOn(systemCallerContext('User'), 'owner')).toBe(true);
        expect(await canActOn(callerContextAs('support', 'caller'), undefined)).toBe(true);
        expect(await canActOn(callerContextAs('support', 'caller'), null)).toBe(true);
    });

    it('ranks a stranger as user, so they outrank nobody', async () => {
        hold('owner', 'customer');

        expect(await canActOn(testCallerContext, 'owner')).toBe(false);
    });
});

/** A context shaped like a key's: the minter's id, at the minter's level. */
const keyAt = (level: 'user' | 'staff' | 'admin'): CallerContext => {
    const base = callerContextAs('admin', 'minter');

    return { ...base, caller: { ...base.caller, level } };
};

describe('canActOn — an API key', () => {
    it('acts at its minter’s level, not above it', async () => {
        hold('owner', 'moderator');

        expect(await canActOn(keyAt('admin'), 'owner')).toBe(true);
        expect(await canActOn(keyAt('staff'), 'owner')).toBe(false);
        expect(await canActOn(keyAt('user'), 'owner')).toBe(false);
    });
});

describe('outrankedRefusal', () => {
    it('answers nothing when the rank rule allows it', async () => {
        hold('owner', 'customer');

        expect(await outrankedRefusal(callerContextAs('support', 'caller'), 'owner', 'user')).toBe(
            undefined
        );
        expect(recorded).toEqual([]);
    });

    it('answers a 403 OUTRANKED and records a failed security.forbidden naming the target', async () => {
        hold('owner', 'admin');

        const refusal = await outrankedRefusal(
            callerContextAs('support', 'caller'),
            'owner',
            'order',
            'order-1'
        );

        expect(refusal).toMatchObject({
            success: false,
            status: 403,
            errors: [{ code: 'OUTRANKED' }]
        });
        expect(recorded).toEqual([
            {
                action: 'security.forbidden',
                outcome: 'failure',
                target_type: 'order',
                target_id: 'order-1',
                metadata: { reason: 'outranked', ownerId: 'owner' }
            }
        ]);
    });
});
