/**
 * The rank rule over the real app: every staff write on something a person owns, driven by every
 * role that holds the route's key, against owners at every level.
 *
 * After the key, a route asks "whose thing is this, and are they below me?". The callers come from
 * `shared/authorization-roles.yaml` read with its `level:`, so a new role, or a re-levelled one, is
 * tested with no edit here. Per cell:
 *
 * | caller → owner of the thing        | expect                                   |
 * | ---------------------------------- | ---------------------------------------- |
 * | lower level                        | passes the rule (the route's own answer) |
 * | same level, someone else           | 403 OUTRANKED                            |
 * | higher level                       | 403 OUTRANKED                            |
 * | the caller themself                | passes the rule                          |
 * | a platform-only account (operator) | 403 OUTRANKED for every shop caller      |
 * | caller lacks the route's key       | 403 FORBIDDEN, before the rule is asked  |
 *
 * `tests/cross-cutting/role-hierarchy-routes.test.ts` holds the row list to the real route table, so the count below
 * cannot drift from what is mounted.
 */
import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { credentialHolding } from '@tests/credentials';
import { PRESET_ROLES } from '@kernel/permissions';
import type { RoleLevel } from '@types';
import {
    createOwner,
    HIERARCHY_ROWS,
    type HierarchyRequest,
    type HierarchyRow,
    type Owner
} from '@tests/role-hierarchy-rows';

setupTestDb();

/** Each level's rank — "below" is a comparison of these. */
const RANK: Record<RoleLevel, number> = { user: 0, staff: 1, admin: 2 };

/** The tenant roles a person can actually log in as. */
const TENANT_ROLES = PRESET_ROLES.filter((role) => role.scope === 'tenant');

/** One role of each level to own the thing: the first the YAML lists. */
const OWNER_ROLE: Record<RoleLevel, string> = {
    user: TENANT_ROLES.find((role) => role.level === 'user')!.name,
    staff: TENANT_ROLES.find((role) => role.level === 'staff')!.name,
    admin: 'admin'
};

/** The roles that hold `key`, so each is a caller for the row. */
const holdersOf = (key: string): string[] =>
    TENANT_ROLES.filter((role) => role.permissions.includes(key)).map((role) => role.name);

/** What one request answered, reduced to the two facts the rule is about. */
const outcomeOf = (response: { status: number; body: unknown }): string => {
    const code = (response.body as { errors?: { code?: string }[] } | undefined)?.errors?.[0]?.code;
    if (response.status === 403 && code === 'OUTRANKED') return 'OUTRANKED';
    return response.status === 401 || response.status === 403 ? `refused:${code}` : 'passed';
};

/** Sends one prepared request as `bearer`. */
const send = (bearer: string, { method, url, body }: HierarchyRequest) => {
    const request = api()[method](url).set('Authorization', bearer);

    return (body === undefined ? request : request.send(body)).set(
        'Idempotency-Key',
        `rank-${Math.random().toString(36).slice(2)}`
    );
};

/** The cell's expected answer: lower passes, anything else is outranked. */
const expectedFor = (callerLevel: RoleLevel, ownerLevel: RoleLevel): string =>
    RANK[ownerLevel] < RANK[callerLevel] ? 'passed' : 'OUTRANKED';

/** Runs one row as one role against every kind of owner. */
const runRow = async (row: HierarchyRow, callerRole: string) => {
    const caller = await authenticateAsRole(callerRole);
    const callerLevel = TENANT_ROLES.find((role) => role.name === callerRole)!.level;
    const owners: { kind: string; owner: Owner; expected: string }[] = [];

    for (const level of ['user', 'staff', 'admin'] as const)
        owners.push({
            kind: level,
            owner: await createOwner(`owner-${level}`, OWNER_ROLE[level]),
            expected: expectedFor(callerLevel, level)
        });
    owners.push(
        {
            kind: 'platform-only',
            owner: await createOwner('owner-platform', null, 'operator'),
            expected: 'OUTRANKED'
        },
        { kind: 'self', owner: { user: caller.user, role: callerRole }, expected: 'passed' }
    );

    const outcomes: Record<string, string> = {};
    for (const { kind, owner } of owners)
        outcomes[kind] = outcomeOf(await send(caller.bearer, await row.prepare(owner)));

    expect(outcomes).toEqual(
        Object.fromEntries(owners.map(({ kind, expected }) => [kind, expected]))
    );
};

describe('the rank rule, row by row', () => {
    it('has a row for every route the rule covers', () => {
        // The count is pinned, and the sweep in `tests/cross-cutting/role-hierarchy-routes.test.ts` pins the names.
        expect(HIERARCHY_ROWS).toHaveLength(24);
    });

    for (const row of HIERARCHY_ROWS) {
        const holders = holdersOf(row.key);

        describe(row.route, () => {
            it('is held by at least one role, or the row tests nothing', () => {
                expect(holders.length).toBeGreaterThan(0);
            });

            it.each(holders)('as %s: only owners below the caller pass', async (role) => {
                await runRow(row, role);
            });

            // A role without the key is refused by the key, before the rank rule is asked.
            if (row.keyed !== false) {
                it('refuses a customer by the key, never by the rank rule', async () => {
                    const caller = await authenticateAsRole('customer');
                    const owner = await createOwner('owner-user', OWNER_ROLE.user);

                    const outcome = outcomeOf(await send(caller.bearer, await row.prepare(owner)));

                    expect(outcome).toBe('refused:FORBIDDEN');
                });
            }
        });
    }
});

describe('an API key acts at its minter’s level', () => {
    it('reaches an account below its minter, and is outranked by an equal', async () => {
        const secret = await credentialHolding(['users.any.update']);
        const customer = await createOwner('owner-user', OWNER_ROLE.user);
        const admin = await createOwner('owner-admin', 'admin');

        const below = await api()
            .patch(`/users/${customer.user.id}`)
            .set('Authorization', `Bearer ${secret}`)
            .send({ username: 'by-key' });
        const equal = await api()
            .patch(`/users/${admin.user.id}`)
            .set('Authorization', `Bearer ${secret}`)
            .send({ username: 'by-key' });

        expect([outcomeOf(below), outcomeOf(equal)]).toEqual(['passed', 'OUTRANKED']);
    });
});
