/**
 * @module
 * The `/api-keys` router. Every route sits behind an `apikeys.*` key — read to list, create to
 * mint, delete to revoke — and every
 * route is reached with a human session — the credentials THIS module mints are presented to
 * OTHER routes, never to these.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { listApiKeys } from './controllers/list-api-keys';
import { mintApiKey } from './controllers/mint-api-key';
import { revokeApiKey } from './controllers/revoke-api-key';

/** Express router for the api-keys admin surface. */
export const router = Router();

/*
 * `isAuth`, NOT `isAuthOrCredential` — and this is the one module where that is a decision rather
 * than a consequence. Nothing here reads `authContext`, so it would qualify on the mechanical
 * test; it is excluded because a credential that can mint credentials is a credential that never
 * has to be rotated. Issuing and revoking api keys stays a human, session-authenticated act.
 */
router.use(getAuth, isAuth);

// GET /api-keys — list the keys (never their secrets).
router.get('/', requirePermission('apikeys.any.read'), listApiKeys);

// POST /api-keys — mint a key.
router.post('/', requirePermission('apikeys.any.create'), mintApiKey);

// DELETE /api-keys/:id — revoke a key.
router.delete('/:id', requirePermission('apikeys.any.delete'), revokeApiKey);
