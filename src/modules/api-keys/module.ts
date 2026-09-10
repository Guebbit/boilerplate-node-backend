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
import { registerCredentialResolver, type ResolvedCredential } from '@kernel/authentication';
import { permissionsOfRole, ANONYMOUS_ROLE } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { rolesOf } from '@kernel/access/store';
import { userRepository } from '@modules/users';
import type { Caller } from '@types';
import { router } from './routes';
import { apiKeyRepository } from './repository';
import { verifyApiKey, parseApiKeyToken, displayIdOf } from './credentials';
import type { ApiKeyDocument } from './model';

/**
 * The minter's CURRENT tenant caller, re-derived rather than trusted from the key's own stored
 * permission snapshot — the check-time half of "a key holds a subset of the minter's permissions,
 * never more" (the mint-time half is `services/api-keys.ts#isMintable`). Same defensive shape as
 * `kernel/permissions.ts#keysInScope`'s own caller flooring: never trust a cached list, re-derive
 * from the authoritative source on every check.
 *
 * The permission list is the role's OWN keys unioned with the anonymous baseline — exactly what
 * `keysInScope` computes for tenant scope, restated here because that helper is private to
 * `kernel/permissions.ts`. `holdsKey`, not a raw list membership check, is what then reads it: the
 * minter may hold the wildcard (`all.manage`) rather than the specific key by name, and only
 * `holdsKey`'s ability model knows a wildcard-holder still holds everything beneath it.
 *
 * `findAuthenticatableById` — not `findById` — for the same reason `account/module.ts`'s own
 * resolver uses it: a deactivated or soft-deleted minter must stop granting access on their very
 * next request, not merely at their next login. `undefined` here is what then makes every key they
 * minted hold nothing, without this document ever being touched.
 */
const currentCallerOf = (apiKey: ApiKeyDocument): Promise<Caller | undefined> =>
    userRepository.findAuthenticatableById(apiKey.createdByUserId).then((user) => {
        if (!user) return undefined;

        return rolesOf(apiKey.createdByUserId, apiKey.tenant, {
            tenant: user.role ?? 'customer',
            platform: null
        }).then((roles) => ({
            id: apiKey.createdByUserId,
            tenantId: apiKey.tenant,
            scope: 'tenant' as const,
            permissions: [
                ...new Set([...permissionsOfRole(roles.tenant), ...ANONYMOUS_ROLE.permissions])
            ]
        }));
    });

/**
 * This module's `sk_...` verify path: parse, prefix lookup, hash compare, then re-floor against
 * the minter's current caller. Every failure mode — malformed token, unknown prefix, wrong secret,
 * revoked, expired, minter gone — resolves `undefined` alike, the same "no caller" outcome
 * `kernel/authentication.ts#resolveCredential` expects; none of them throws.
 */
const fromBearerToken = (token: string): Promise<ResolvedCredential | undefined> => {
    const parsed = parseApiKeyToken(token);
    if (!parsed) return Promise.resolve(undefined);

    return apiKeyRepository.findActiveByPrefix(parsed.publicPrefix).then((apiKey) => {
        if (!apiKey || !verifyApiKey(token, apiKey.hash)) return undefined;

        return currentCallerOf(apiKey).then((currentCaller) => {
            // Fire-and-forget — see `repository.ts#touchLastUsed`'s own doc comment for why this
            // path never awaits it.
            void apiKeyRepository.touchLastUsed(String(apiKey._id));

            return {
                caller: {
                    id: apiKey.createdByUserId,
                    tenantId: apiKey.tenant,
                    scope: 'tenant' as const,
                    permissions: currentCaller
                        ? apiKey.permissions.filter((key) => holdsKey(currentCaller, key))
                        : []
                },
                credentialId: displayIdOf(apiKey.publicPrefix)
            };
        });
    });
};

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
    permissions: ['apikeys.read', 'apikeys.manage']
} satisfies AppModule;
