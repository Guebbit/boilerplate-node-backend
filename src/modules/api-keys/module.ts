/**
 * @module
 * Machine-to-machine credentials: mint, list, revoke, and the `CredentialResolver` that lets an
 * `sk_...` bearer token authenticate a request the way a JWT does.
 *
 * Owns:        the `apikeys` collection, outright — no other module reads or writes it.
 * Reaches far: registers `kernel/authentication.ts`'s `CredentialResolver` port at import time,
 *              the same "module fills a kernel port" shape `account/module.ts`'s
 *              `registerAuthResolver` already establishes.
 *
 * See: docs/modules/api-keys.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerCredentialResolver } from '@kernel/authentication';
import { router } from './routes';
import { fromBearerToken } from './services/resolver';
import { findOwnApiKeys } from './services/api-keys';

registerCredentialResolver({ fromBearerToken });

/** This module's manifest entry. */
export default {
    name: 'api-keys',
    basePath: '/api-keys',
    routes: router,
    locales: path.join(__dirname, 'locales'),
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone.
     */
    permissions: ['apikeys.any.read', 'apikeys.any.create', 'apikeys.any.delete'],
    personalData: [
        {
            section: 'apiKeys',
            collect: (subject) => findOwnApiKeys(subject.userId)
        }
    ]
} satisfies AppModule;
