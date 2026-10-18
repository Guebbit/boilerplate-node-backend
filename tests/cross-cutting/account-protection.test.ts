/**
 * The protection of staff accounts, row by row, through the real app and a real database. A holder
 * of a users key changes a plain customer's account, and an account that holds a staff role only if
 * they also hold `assign:Role` — which, of the preset roles, is the administrator alone, and which
 * no API key can hold.
 *
 * Each row of `tests/support/account-protection-rows.ts` is run as every role that holds the row's
 * key, against every kind of account: a customer, a staff account, an administrator, a
 * platform-only account and the caller's own. `docs/theory/authorization.md#protecting-people` is
 * the rule in prose.
 */
import { api, authenticateAsRole } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { credentialHolding } from '@tests/credentials';
import { PRESET_ROLES } from '@kernel/permissions';
import {
    createOwner,
    PROTECTION_ROWS,
    type Owner,
    type ProtectionRequest,
    type ProtectionRow
} from '@tests/account-protection-rows';

setupTestDb();

/** The tenant roles a person can actually log in as: `system` is never assigned to an account. */
const TENANT_ROLES = PRESET_ROLES.filter(
    (role) => role.scope === 'tenant' && role.assignable !== false
);

/** The roles that hold `key`, so each is a caller for the row. */
const holdersOf = (key: string): string[] =>
    TENANT_ROLES.filter((role) => role.permissions.includes(key)).map((role) => role.name);

/** Whether a role may change an account that holds a staff role. */
const managesRoles = (role: string): boolean =>
    TENANT_ROLES.find((each) => each.name === role)?.permissions.includes('assign:Role') === true;

/** What one request answered, reduced to the two facts the rule is about. */
const outcomeOf = (response: { status: number; body: unknown }): string => {
    const code = (response.body as { errors?: { code?: string }[] } | undefined)?.errors?.[0]?.code;
    if (response.status === 403 && code === 'ROLE_MANAGEMENT_REQUIRED')
        return 'ROLE_MANAGEMENT_REQUIRED';
    return response.status === 401 || response.status === 403 ? `refused:${code}` : 'passed';
};

/** Sends one prepared request as `bearer`. */
const send = (bearer: string, { method, url, body }: ProtectionRequest) => {
    const request = api()[method](url).set('Authorization', bearer);

    return (body === undefined ? request : request.send(body)).set(
        'Idempotency-Key',
        `protect-${Math.random().toString(36).slice(2)}`
    );
};

/** Runs one row as one role against every kind of account. */
const runRow = async (row: ProtectionRow, callerRole: string) => {
    const caller = await authenticateAsRole(callerRole);
    const mayManage = managesRoles(callerRole);
    const owners: { kind: string; owner: Owner; expected: string }[] = [
        {
            kind: 'customer',
            owner: await createOwner('owner-customer', null),
            expected: 'passed'
        },
        {
            kind: 'staff',
            owner: await createOwner('owner-staff', 'support'),
            expected: mayManage ? 'passed' : 'ROLE_MANAGEMENT_REQUIRED'
        },
        {
            kind: 'admin',
            owner: await createOwner('owner-admin', 'admin'),
            expected: mayManage ? 'passed' : 'ROLE_MANAGEMENT_REQUIRED'
        },
        {
            kind: 'platform-only',
            owner: await createOwner('owner-platform', null, 'operator'),
            expected: mayManage ? 'passed' : 'ROLE_MANAGEMENT_REQUIRED'
        },
        { kind: 'self', owner: { user: caller.user, role: callerRole }, expected: 'passed' }
    ];

    const outcomes: Record<string, string> = {};
    for (const { kind, owner } of owners)
        outcomes[kind] = outcomeOf(await send(caller.bearer, row.prepare(owner)));

    expect(outcomes).toEqual(
        Object.fromEntries(owners.map(({ kind, expected }) => [kind, expected]))
    );
};

describe('the protection of staff accounts, row by row', () => {
    for (const row of PROTECTION_ROWS) {
        const holders = holdersOf(row.key);

        describe(row.route, () => {
            it('is held by at least one role, or the row tests nothing', () => {
                expect(holders.length).toBeGreaterThan(0);
            });

            it.each(holders)('as %s: only a role manager reaches a staff account', async (role) => {
                await runRow(row, role);
            });

            it('refuses a customer by the key, never by the protection', async () => {
                const caller = await authenticateAsRole('customer');
                const owner = await createOwner('owner-customer', null);

                const outcome = outcomeOf(await send(caller.bearer, row.prepare(owner)));

                expect(outcome).toBe('refused:FORBIDDEN');
            });
        });
    }
});

/** `PATCH /users/:id` as an API key, reduced to its outcome. */
const patchAsKey = async (secret: string, owner: Owner): Promise<string> =>
    outcomeOf(
        await api()
            .patch(`/users/${owner.user.id}`)
            .set('Authorization', `Bearer ${secret}`)
            .send({ username: 'by-key' })
    );

describe('an API key holds exactly the keys it was minted with', () => {
    it('reaches a customer, and is refused a staff account', async () => {
        const secret = await credentialHolding(['update:User']);
        const customer = await createOwner('owner-customer', null);
        const admin = await createOwner('owner-admin', 'admin');

        expect([await patchAsKey(secret, customer), await patchAsKey(secret, admin)]).toEqual([
            'passed',
            'ROLE_MANAGEMENT_REQUIRED'
        ]);
    });

    it('cannot be minted with role management, so no key ever reaches a staff account', async () => {
        await expect(credentialHolding(['update:User', 'assign:Role'])).rejects.toThrow(
            'mint failed in test setup'
        );
    });
});
