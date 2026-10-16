/**
 * Every write on another person's ACCOUNT — the rows `tests/cross-cutting/account-protection.test.ts`
 * drives through the real app, and the list `tests/cross-cutting/account-protection-routes.test.ts`
 * holds the `users` route table to. One row per route: the permission key it needs, and how to point
 * a request at an account.
 *
 * Kept as data in one place so the two suites cannot disagree about which routes the protection of
 * staff accounts covers: a new write route on `users` is either a row here or an entry in
 * {@link UNOWNED_WRITES}, and the sweep fails until it is.
 */

import { accessService } from '@modules/access';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';

/** A person the request is aimed at: their account and the staff role they hold, if any. */
export interface Owner {
    user: UserDocument;
    /** `null` for a plain customer and for the platform-only account, which holds no shop role. */
    role: string | null;
}

/** One request, ready to send. */
export interface ProtectionRequest {
    method: 'put' | 'patch' | 'post' | 'delete';
    url: string;
    body?: Record<string, unknown>;
}

/** One route the protection covers. */
export interface ProtectionRow {
    /** `${module} ${METHOD} ${path}`, spelled as `effectiveRouteTable` names the route. */
    route: string;
    /** The key the callers are the holders of: the route's own. */
    key: string;
    /** Builds the request that changes `owner`'s account. */
    prepare: (owner: Owner) => ProtectionRequest;
}

/** A route addressed by the owner's own account id. */
const onUser =
    (
        method: ProtectionRequest['method'],
        suffix: string,
        body: (owner: Owner) => Record<string, unknown> | undefined = () => undefined
    ): ProtectionRow['prepare'] =>
    (owner) => ({ method, url: `/users/${owner.user.id}${suffix}`, body: body(owner) });

/** The rows. The route sweep holds this list to the real route table, so count and names matter. */
export const PROTECTION_ROWS: readonly ProtectionRow[] = [
    {
        route: 'users PUT /:id',
        key: 'update:User',
        prepare: onUser('put', '', (owner) => ({
            username: 'protection-check',
            role: owner.role,
            active: true
        }))
    },
    {
        route: 'users PATCH /:id',
        key: 'update:User',
        prepare: onUser('patch', '', () => ({ username: 'protection-check' }))
    },
    { route: 'users DELETE /:id', key: 'delete:User', prepare: onUser('delete', '') },
    {
        route: 'users DELETE /:id/hard',
        key: 'delete:User',
        prepare: onUser('delete', '/hard')
    },
    {
        route: 'users POST /:id/restore',
        key: 'delete:User',
        prepare: onUser('post', '/restore')
    },
    {
        route: 'users DELETE /',
        key: 'delete:User',
        prepare: (owner) => ({ method: 'delete', url: '/users', body: { id: owner.user.id } })
    }
];

/**
 * The write routes of `users` that have NO account for the protection to judge, each with the
 * reason. The route sweep fails for a write route that is neither a row nor here.
 */
export const UNOWNED_WRITES: Readonly<Record<string, string>> = {
    'users POST /search': 'a read wearing a POST',
    'users POST /': 'creates an account; there is no account yet'
};

/** Creates an owner holding `role` in the shop (or nothing, when `role` is `null`). */
export const createOwner = async (
    name: string,
    role: string | null,
    platformRole?: string
): Promise<Owner> => {
    const user = await createUser(
        { email: `${name}@owners.test`, username: name, verifiedAt: new Date() },
        role ?? undefined
    );
    if (platformRole) await accessService.assignRole(user.id, null, 'platform', platformRole);

    return { user, role };
};
