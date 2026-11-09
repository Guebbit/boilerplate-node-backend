/**
 * @module
 * The role door's router: `POST /users/:id/assign-role` and `/revoke-role`, the only way an
 * existing account gets a staff role or loses one.
 *
 * Why its own router: `isAuth`, not `isAuthOrCredential`. `assign:Role` is `credential: false`
 * (an API key never manages staff), and the router in `./routes` lets a key in. Mounted after it,
 * so a key's request reaches here and `isAuth` answers it 401.
 *
 * See: docs/modules/users.md#the-role-door
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { postAssignRole, postRevokeRole } from './controllers/post-user-role';

/** Express router for the role door. */
export const router = Router();

// The guards sit on each route, not on the router: a key calling any other `/users` path still
// reaches the router above and its own answer, not a 401 from here.
// `assign:Role` carries the critical step-up and the `ROLE_MANAGEMENT_REQUIRED` refusal itself
// (its rule in `access`), so nothing more is asked. No `If-Match`: the last of two callers naming
// different roles wins; a repeat answers 409.

// POST /users/:id/assign-role — give the account the role named.
router.post(
    '/:id/assign-role',
    getAuth,
    isAuth,
    requirePermission('assign', 'Role'),
    postAssignRole
);

// POST /users/:id/revoke-role — take the account's staff role away.
router.post(
    '/:id/revoke-role',
    getAuth,
    isAuth,
    requirePermission('assign', 'Role'),
    postRevokeRole
);
