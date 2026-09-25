/**
 * @module
 * The admin-only `/users` router: search, item read, write and delete, wired to the shared
 * response cache and the route-flag middleware the hard-delete endpoint uses.
 *
 * See: docs/modules/users.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getUsers } from './controllers/get-users';
import { createUser } from './controllers/create-user';
import { replaceUser, updateUser } from './controllers/update-user';
import { deleteUsers } from './controllers/delete-users';
import { restoreUsers } from './controllers/restore-users';
import { getUserItem } from './controllers/get-user-item';
import { deleteUserTwoFactor } from './controllers/delete-user-two-factor';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for user management (admin only). */
export const router = Router();

// Every route below needs a caller, but not the SAME key — `manager` reads and `support` reads
// and updates, and a router-wide gate on one key made the other unreachable no matter what the
// role file granted. Each mount below states the one key its own action needs.
//
// `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module. Every route
// here is a `users.any.*` key over the tenant's directory — a partner integration syncing
// accounts is the documented use case. No controller reads `authContext`.
router.use(getAuth, isAuthOrCredential);

// POST /users/search — must come before /:id to avoid matching "search" as an id. Never
// Redis-cached (D2): every worker keyed this per admin caller although the answer never depended
// on WHICH admin asked, only that they could — an expanding, never-shared store for no benefit.
// `privateNoCache` lets the browser keep its own copy, revalidated every time.
router.post('/search', requirePermission('users.any.read'), privateNoCache, getUsers);

// GET /users
router.get('/', requirePermission('users.any.read'), privateNoCache, getUsers);

// POST /users (create)
router.post('/', requirePermission('users.any.create'), uploadLimiter, upload.image(), createUser);

// DELETE /users — id in body
router.delete('/', requirePermission('users.any.delete'), deleteUsers);

// GET /users/:id — never Redis-cached (D2), same reasoning as the search routes above.
router.get('/:id', requirePermission('users.any.read'), privateNoCache, getUserItem);

// PUT /users/:id (replace) and PATCH /users/:id (merge) — AUDIT_0924 D17d.
router.put(
    '/:id',
    requirePermission('users.any.update'),
    uploadLimiter,
    upload.image(),
    replaceUser
);
router.patch(
    '/:id',
    requirePermission('users.any.update'),
    uploadLimiter,
    upload.image(),
    updateUser
);

// DELETE /users/:id — soft delete unless ?hardDelete=true
router.delete('/:id', requirePermission('users.any.delete'), deleteUsers);

// POST /users/:id/restore — undo a soft delete; a second DELETE never does
router.post('/:id/restore', requirePermission('users.any.delete'), restoreUsers);

// DELETE /users/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('users.any.delete'),
    routeFlag('hardDelete'),
    deleteUsers
);

// DELETE /users/:id/2fa — admin-assisted 2FA recovery, no code required. The one deliberate
// exception to "prove the factor to remove it" — see the controller's own comment. Clearing a
// second factor is `users.any.update`'s own description in `shared/authorization-keys.yaml`.
router.delete('/:id/2fa', requirePermission('users.any.update'), deleteUserTwoFactor);
