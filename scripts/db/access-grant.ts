/*
 * Grant a role to an existing account — the connection-free half of `grant-access.ts`.
 *
 * Split out the same way `index-sync.ts` is split from `sync-indexes.ts`: the CLI wrapper opens a
 * connection and parses `process.argv` on import, which a test cannot drive per case.
 */

import { assignRole } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { userService } from '@modules/users';
import type { AuthorizationScope, CallerContext } from '@types';

/** Raised for every way this command can be misused — the CLI wrapper turns it into a clean exit. */
export class GrantAccessError extends Error {}

/**
 * Look an account up by email, then grant it a role — refusing clearly rather than creating
 * anything on the fly.
 *
 * `assignRole`'s own docblock reserves exactly this caller — "an operator on the console" — as one
 * of the three callers allowed to grant with nobody to escalate from, hence no `granter` argument.
 *
 * @param context - who the audit row names as the granter; both console commands pass the system
 *   caller, since nobody is signed in at a shell. Omitted, the grant is not audited.
 * @throws GrantAccessError when no account holds `email`
 * @throws AccessInvariantError when `roleName` is not a declared role in `scope` — the only way
 *   `assignRole` can refuse here, since this caller passes no `granter` to escalate from
 */
export const grantAccess = (
    email: string,
    roleName: string,
    scope: AuthorizationScope,
    context?: CallerContext
): Promise<void> =>
    userService.findByEmail(email).then((user) => {
        if (!user) {
            throw new GrantAccessError(
                `[access] no account for "${email}" — sign up first, then grant a role.`
            );
        }

        return assignRole(
            user.id,
            scope === 'platform' ? null : DEPLOYMENT_TENANT_ID,
            scope,
            roleName,
            undefined,
            context
        ).then(() => undefined);
    });
