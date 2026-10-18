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
import { powersChangeRequested } from './services/update';
import { getUsers } from './controllers/get-users';
import { createUser } from './controllers/create-user';
import { replaceUser, updateUser } from './controllers/update-user';
import { deleteUsers } from './controllers/delete-users';
import { restoreUsers } from './controllers/restore-users';
import { getUserItem } from './controllers/get-user-item';
import { noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/**
 * Whether this write changes who holds powers, and the caller manages staff: a role that actually
 * changes (handing one out, taking it away with `role: null`), or a ban or unban. Changing a
 * person's powers is the one admin act a stolen session must not do quietly, so it asks for a
 * fresh session at the tier minting an API key does.
 *
 * Only a caller holding `assign:Role` is asked. Anyone else is refused by the service with an
 * audited 403 `ROLE_MANAGEMENT_REQUIRED`, which is the better answer than a login they could
 * never use. A PUT carries `role` every time, so "named" is not "changed": the stored role is
 * compared, as the service does. A ban keeps the role, so unbanning a banned administrator hands
 * every power back and banning every other administrator locks the shop out. A moderator who bans
 * a customer holds no `assign:Role` and is never asked.
 *
 * Read from the body, so this guard comes after `upload.image()`, which populates it for a
 * multipart request.
 */
const changesPowers = (request: Request): Promise<boolean> => {
    if (!request.caller || !holds(request.caller, 'assign', 'Role')) return Promise.resolve(false);

    const body = request.body as { role?: string | null; active?: boolean | string } | undefined;

    // No stored account to compare on a create: naming a role, or a ban flag, is the change.
    if (typeof request.params.id !== 'string')
        return Promise.resolve(
            body?.role != null || body?.active === false || body?.active === 'false'
        );

    // A failed read cannot prove "no change", so it asks.
    return powersChangeRequested(request.params.id, body).catch(() => true);
};

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

// DELETE /users — id in body
router.delete('/', requirePermission('delete', 'User'), deleteUsers);

// GET /users/:id — never Redis-cached, same reasoning as the search routes above.
router.get('/:id', requirePermission('read', 'User'), privateNoCache, getUserItem);

// PUT /users/:id — replace the user.
router.put(
    '/:id',
    requirePermission('update', 'User'),
    uploadLimiter,
    upload.image(),
    requireFreshAuthWhen(changesPowers, 'critical'),
    replaceUser
);

// PATCH /users/:id — merge the fields sent.
router.patch(
    '/:id',
    requirePermission('update', 'User'),
    uploadLimiter,
    upload.image(),
    requireFreshAuthWhen(changesPowers, 'critical'),
    updateUser
);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete('/:id', requirePermission('delete', 'User'), deleteUsers);

// POST /users/:id/restore — undo a soft delete; a second DELETE never does
router.post('/:id/restore', requirePermission('delete', 'User'), restoreUsers);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('delete', 'User'),
    routeFlag('hardDelete'),
    deleteUsers
);
