/**
 * @module
 * Machine-to-machine credentials: mint, list, revoke, and the `CredentialResolver` that lets an
 * `sk_...` bearer token authenticate a request the way a JWT does.
 *
 * Owns:        the `apikeys` collection, outright — no other module reads or writes it.
 * Listens:    `account.sessions-revoked` — revokes what a person minted when they may be compromised.
 * Reaches far: registers `kernel/authentication.ts`'s `CredentialResolver` port from its own
 *              `onRegistered` hook, the same "module fills a kernel port" shape
 *              `account/module.ts`'s `registerAuthResolver` already establishes.
 *
 * See: docs/modules/api-keys.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerCredentialResolver } from '@kernel/authentication';
import { router } from './routes';
import { fromBearerToken } from './services/resolver';
import { findOwnApiKeys, apiKeysDeleteByUserId, revokeAllMintedBy } from './services/api-keys';
import { onDomainEvent } from '@kernel/events';
import { ACCOUNT_SESSIONS_REVOKED } from '@modules/account';

/**
 * Installs the credential resolver once this module is known to be enabled (D15) — registering it
 * at import time would let anything that merely imports this file (a type, a test) enable
 * `sk_...` authentication for the whole app.
 */
const onRegistered = (): void => {
    registerCredentialResolver({ fromBearerToken });
};

/** This module's manifest entry. */
export default {
    name: 'api-keys',
    basePath: '/api-keys',
    routes: router,
    onRegistered,
    subscribe: () => {
        // A key outlives every session, so the events that end sessions wholesale (logout
        // everywhere, a password reset) revoke what the person minted. Owned here: `account` knows
        // nothing about keys, it only announces.
        onDomainEvent(ACCOUNT_SESSIONS_REVOKED, ({ userId, reason }) =>
            revokeAllMintedBy(userId, reason)
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates'),
    personalData: [
        {
            section: 'apiKeys',
            collect: (subject) => findOwnApiKeys(subject.userId),
            // A destroyed account takes its minted credentials with it, inside the same
            // transaction — the same hook `addresses`, `cart`, `wishlist` and `payments` each
            // declare on their own collection. Without this, an erased user's keys stayed live:
            // the credential resolver refuses them once the user is gone, but the rows themselves
            // outlived the account.
            erase: apiKeysDeleteByUserId
        }
    ]
} satisfies AppModule;
