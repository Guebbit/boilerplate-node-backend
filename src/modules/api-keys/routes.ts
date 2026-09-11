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

router.use(getAuth, isAuth);

router.get('/', requirePermission('apikeys.read'), listApiKeys);
router.post('/', requirePermission('apikeys.create'), mintApiKey);
router.delete('/:id', requirePermission('apikeys.delete'), revokeApiKey);
