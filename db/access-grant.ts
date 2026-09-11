/*
 * Grant a role to an existing account — the connection-free half of `grant-access.ts`.
 *
 * Split out the same way `index-sync.ts` is split from `sync-indexes.ts`: the CLI wrapper opens a
 * connection and parses `process.argv` on import, which a test cannot drive per case.
 */

import { assignRole } from '@kernel/access/store';
import { DEMO_TENANT_ID } from '@kernel/access/seed';
import { userService } from '@modules/users';
import type { AuthorizationScope } from '@types';

/** Raised for every way this command can be misused — the CLI wrapper turns it into a clean exit. */
export class GrantAccessError extends Error {}

/**
 * Look an account up by email, then grant it a role — refusing clearly rather than creating
 * anything on the fly.
 *
 * `assignRole`'s own docblock reserves exactly this caller — "an operator on the console" — as one
 * of the three callers allowed to grant with nobody to escalate from, hence no `granter` argument.
 *
 * @throws GrantAccessError when no account holds `email`
 * @throws AccessInvariantError when `assignRole` refuses the role itself — undeclared, or a key
 *   the granted role would hold that no module owns
 */
export const grantAccess = (
    email: string,
    roleName: string,
    scope: AuthorizationScope
): Promise<void> =>
    userService.findByEmail(email).then((user) => {
        if (!user) {
            throw new GrantAccessError(
                `[access] no account for "${email}" — sign up first, then grant a role.`
            );
        }

        return assignRole(
            user.id,
            scope === 'platform' ? null : DEMO_TENANT_ID,
            scope,
            roleName
        ).then(() => undefined);
    });
