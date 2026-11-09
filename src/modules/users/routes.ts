/**
 * @module
 * The admin-only `/users` router: search, item read, write and delete, wired to the shared
 * response cache and the route-flag middleware the hard-delete endpoint uses.
 *
 * See: docs/modules/users.md
 */

import { Router, type Request } from 'express';
import { holds } from '@kernel/ability';
import {
    getAuth,
    isAuthOrCredential,
    requireFreshAuthWhen,
    requirePermission
} from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getUsers } from './controllers/get-users';
import { createUser } from './controllers/post-user';
import { replaceUser, updateUser } from './controllers/update-user';
import { deleteUsers } from './controllers/delete-users';
import { restoreUsers } from './controllers/post-user-restore';
import { getUserItem } from './controllers/get-user';
import { postLiftPurchaseHold } from './controllers/post-lift-purchase-hold';
import { postPlacePurchaseHold } from './controllers/post-place-purchase-hold';
import { postActivate, postDeactivate } from './controllers/post-user-activation';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/**
 * Whether this create changes who holds powers, and the caller manages staff: an account created
 * with a role, or deactivated. Changing a person's powers is the one admin act a stolen session
 * must not do quietly, so it asks for a fresh session at the tier minting an API key does. (An
 * existing account's role has its own door, `assign-role`, which asks it of every call.)
 *
 * Only a caller holding `assign:Role` is asked. Anyone else is refused by the service with an
 * audited 403 `ROLE_MANAGEMENT_REQUIRED`, which is the better answer than a login they could
 * never use.
 *
 * Read from the body, so this guard comes after `upload.image()`, which populates it for a
 * multipart request. A multipart body is read before validation turns its string into a boolean.
 */
const changesPowers = (request: Request): Promise<boolean> => {
    if (!request.caller || !holds(request.caller, 'assign', 'Role')) return Promise.resolve(false);

    const body = request.body as { role?: string; active?: boolean | string } | undefined;

    return Promise.resolve(
        body?.role != null || body?.active === false || body?.active === 'false'
    );
};

/**
 * Whether this switch is one a role manager must prove a fresh session for. A ban keeps the role,
 * so activating a deactivated administrator hands every power back, and deactivating every other
 * administrator locks the shop out. A moderator who deactivates a customer holds no `assign:Role`
 * and is never asked.
 */
const switchesAccount = (request: Request): Promise<boolean> =>
    Promise.resolve(Boolean(request.caller && holds(request.caller, 'assign', 'Role')));

/** Express router for user management (admin only). */
export const router = Router();

// Every route below needs a caller, but not the SAME key — `manager` reads and `support` reads
// and updates, and a router-wide gate on one key made the other unreachable no matter what the
// role file granted. Each mount below states the one key its own action needs.
//
// `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module. Every route
// here is a `User` rule over the tenant's directory — a partner integration syncing
// accounts is the documented use case. No controller reads `authContext`.
router.use(getAuth, isAuthOrCredential);

// POST /users/search — must come before /:id to avoid matching "search" as an id. Never
// Redis-cached: an admin-only answer, which a shared cache must never hold — RFC 9111 §3.5.
// `noStore`, like every POST answer.
router.post('/search', requirePermission('read', 'User'), noStore, getUsers);

// GET /users. `privateNoCache`: the browser may keep its own copy, revalidated every time.
router.get('/', requirePermission('read', 'User'), privateNoCache, getUsers);

// POST /users (create)
router.post(
    '/',
    requirePermission('create', 'User'),
    uploadLimiter,
    upload.image(),
    requireFreshAuthWhen(changesPowers, 'critical'),
    createUser
);

// GET /users/:id — never Redis-cached, same reasoning as the search routes above.
router.get('/:id', requirePermission('read', 'User'), privateNoCache, getUserItem);

// PUT /users/:id — replace the user.
router.put('/:id', requirePermission('update', 'User'), uploadLimiter, upload.image(), replaceUser);

// PATCH /users/:id — merge the fields sent.
router.patch(
    '/:id',
    requirePermission('update', 'User'),
    uploadLimiter,
    upload.image(),
    updateUser
);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete('/:id', requirePermission('delete', 'User'), deleteUsers);

// POST /users/:id/place-purchase-hold and /lift-purchase-hold — pause checkout for one account, or
// end the pause. The ban's permission: both are a staff act on a buyer's standing, and neither
// touches their login. A repeat finds the state reached and answers 409.
router.post('/:id/place-purchase-hold', requirePermission('ban', 'User'), postPlacePurchaseHold);
router.post('/:id/lift-purchase-hold', requirePermission('ban', 'User'), postLiftPurchaseHold);

// POST /users/:id/activate and /deactivate — switch an account on or off. A deactivation is a
// ban today, so both ride the ban's permission; each answers 409 when the account is there already.
router.post(
    '/:id/activate',
    requirePermission('ban', 'User'),
    requireFreshAuthWhen(switchesAccount, 'critical'),
    postActivate
);
router.post(
    '/:id/deactivate',
    requirePermission('ban', 'User'),
    requireFreshAuthWhen(switchesAccount, 'critical'),
    postDeactivate
);

// POST /users/:id/restore — undo a soft delete; a second DELETE never does
router.post('/:id/restore', requirePermission('delete', 'User'), restoreUsers);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('delete', 'User'),
    routeFlag('hardDelete'),
    deleteUsers
);
