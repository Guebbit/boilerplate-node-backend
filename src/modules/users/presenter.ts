/**
 * @module
 * The one place a stored account becomes the `User` contract — `account`'s own controllers reach
 * this through `userService.toUser`/`toUserContract`, never `./model` directly (the persistence
 * wall): a controller may not reach a module's model layer, so the shaping helper it needs rides
 * through the service.
 */

import type { Caller, RoleLevel, User, UserActions } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { decryptPii } from '@infrastructure/security/pii-encryption';
import { heldKeys } from '@kernel/ability';
import { isBelowLevel, levelOfRoles } from '@kernel/permissions';
import { rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { UserDocument, UserWire } from './model';

/**
 * Maps a loaded account straight onto the `User` contract, ISO-stringifying the four fields
 * {@link UserWire} redeclares as `Date`. Takes {@link UserWire} rather than {@link UserDocument}:
 * a hydrated document satisfies it too (a superset), and `search()`'s already-normalized rows
 * — which never carry `password`/`tokens`/2FA credential material to begin with — need no
 * document methods this only ever reads plain fields off anyway.
 *
 * @param role - the caller's CURRENT tenant role, read from the membership store by whoever calls
 *   this — never off the document, which holds no role of its own. `null` prints as absent, the
 *   same as every other optional field below.
 * @param actions - what the requesting caller may do to this account ({@link userActionsFor}),
 *   for the `/users` reads and writes; absent where there is no caller to rank (`/account`)
 */
export const presentUser = (document: UserWire, role: string | null, actions?: UserActions): User =>
    carryVersion(document, {
        id: document.id,
        email: document.email,
        username: document.username,
        ...(role === null ? {} : { role }),
        ...(actions === undefined ? {} : { actions }),
        ...(document.active === undefined ? {} : { active: document.active }),
        ...(document.verifiedAt ? { verifiedAt: document.verifiedAt.toISOString() } : {}),
        ...(document.pendingEmail === undefined ? {} : { pendingEmail: document.pendingEmail }),
        ...(document.imageUrl === undefined ? {} : { imageUrl: document.imageUrl }),
        ...(document.thumbnailUrl === undefined ? {} : { thumbnailUrl: document.thumbnailUrl }),
        ...(document.locale === undefined ? {} : { locale: document.locale }),
        // Stored encrypted (`./service`'s `update`, under `NODE_PII_ENCRYPTION_KEY`) — this is the
        // one place a document's `phone` reaches the wire, hydrated or lean/searched alike, so it's
        // the one place that decrypts it.
        ...(document.phone === undefined
            ? {}
            : { phone: decryptPii(document.phone, 'user phone') }),
        ...(document.website === undefined ? {} : { website: document.website }),
        ...(document.analyticsConsent === undefined
            ? {}
            : { analyticsConsent: document.analyticsConsent }),
        ...(document.termsAccepted === undefined ? {} : { termsAccepted: document.termsAccepted }),
        ...(document.twoFactorEnabledAt
            ? { twoFactorEnabledAt: document.twoFactorEnabledAt.toISOString() }
            : {}),
        ...(document.createdAt ? { createdAt: document.createdAt.toISOString() } : {}),
        ...(document.updatedAt ? { updatedAt: document.updatedAt.toISOString() } : {}),
        ...(document.deletedAt ? { deletedAt: document.deletedAt.toISOString() } : {})
    });

/**
 * What `caller` may do to one account: each route's key AND the rank rule. The caller's own
 * account is judged by the keys alone, as the rule never applies to one's own things; anyone else's
 * must rank strictly below the caller.
 *
 * @param ownerId - the account being described
 * @param ownerLevel - its level ({@link levelOfRoles} of the roles it holds)
 * @param caller - `request.caller`
 */
export const userActionsFor = (
    ownerId: string,
    ownerLevel: RoleLevel,
    caller: Caller
): UserActions => {
    const held = heldKeys(caller);
    const reachable = caller.id === ownerId || isBelowLevel(ownerLevel, caller.level);

    return {
        update: reachable && held.has('users.any.update'),
        ban: reachable && held.has('users.any.ban'),
        delete: reachable && held.has('users.any.delete')
    };
};

/**
 * The contract `User` for an already-loaded document — resolves its CURRENT role fresh from the
 * membership store (the document holds none of its own) and applies {@link presentUser} in one
 * call, so a controller does not chain the two itself. Single-document counterpart to
 * `rolesOfMany` (see `GET /users`'s own list read).
 *
 * @param caller - `request.caller` for an admin read or write, so the row says what that caller
 *   may do to it; omitted by `account`, whose subject is the caller themselves
 */
export const presentUserWithCurrentRole = (user: UserDocument, caller?: Caller): Promise<User> =>
    rolesOf(String(user._id), DEPLOYMENT_TENANT_ID).then((roles) =>
        presentUser(
            user,
            roles.tenant,
            caller ? userActionsFor(String(user._id), levelOfRoles(roles), caller) : undefined
        )
    );
