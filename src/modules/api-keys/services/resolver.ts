/**
 * @module
 * The `CredentialResolver` this module installs into `kernel/authentication.ts`: turns a
 * presented `sk_...` bearer token into the `Caller` it names, re-floored against its minter's
 * CURRENT permissions on every request. `module.ts` only registers the result at import time —
 * the resolution logic itself lives here, alongside the rest of this module's services.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 */

import { logger } from '@infrastructure/adapters/logger';
import type { ResolvedCredential } from '@kernel/authentication';
import { keysInScope, assembleCaller } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { rolesOf } from '@modules/access';
import { userService } from '@modules/users';
import type { Caller } from '@types';
import { apiKeyRepository } from '../repository';
import { verifyApiKey, parseApiKeyToken, displayIdOf } from '../credentials';
import type { ApiKeyDocument } from '../model';

/**
 * The minter's CURRENT tenant caller, re-derived rather than trusted from the key's own stored
 * permission snapshot — the check-time half of "a key holds a subset of the minter's permissions,
 * never more" (the mint-time half is `services/api-keys.ts#isMintable`). Same defensive shape as
 * `kernel/permissions.ts#keysInScope`'s own caller flooring: never trust a cached list, re-derive
 * from the authoritative source on every check — `keysInScope` itself is what does that
 * derivation, `roles.tenant` and all, so this stays a call rather than a second copy of it.
 * `holdsKey`, not a raw list membership check, is what then reads the result — the CASL ability
 * it builds is what a mint-floor check should ask, the same as any other route guard, rather than
 * this file re-deriving its own answer from the raw list.
 *
 * `findAuthenticatableById` — not `findById` — for the same reason `account/module.ts`'s own
 * resolver uses it: a deactivated or soft-deleted minter must stop granting access on their very
 * next request, not merely at their next login. `undefined` here is what then makes every key they
 * minted hold nothing, without this document ever being touched.
 */
const currentCallerOf = (apiKey: ApiKeyDocument): Promise<Caller | undefined> =>
    userService.findAuthenticatableById(apiKey.createdByUserId).then((user) => {
        if (!user) return undefined;

        return rolesOf(apiKey.createdByUserId, apiKey.tenant).then((roles) => {
            const permissions = keysInScope(roles.tenant, 'tenant');

            return assembleCaller(apiKey.createdByUserId, apiKey.tenant, 'tenant', permissions);
        });
    });

/**
 * This module's `sk_...` verify path: parse, prefix lookup, hash compare, then re-floor against
 * the minter's current caller. Every failure mode — malformed token, unknown prefix, wrong secret,
 * revoked, expired, minter gone — resolves `undefined` alike, the same "no caller" outcome
 * `kernel/authentication.ts#resolveCredential` expects; none of them throws.
 */
export const fromBearerToken = (token: string): Promise<ResolvedCredential | undefined> => {
    const parsed = parseApiKeyToken(token);
    if (!parsed) return Promise.resolve(undefined);

    return apiKeyRepository.findActiveByPrefix(parsed.publicPrefix).then((apiKey) => {
        if (!apiKey || !verifyApiKey(token, apiKey.hash)) return undefined;

        return currentCallerOf(apiKey).then((currentCaller) => {
            // Fire-and-forget — see `repository.ts#touchLastUsed`'s own doc comment for why this
            // path never awaits it. A rejection has nobody else to catch it, so it is logged here
            // rather than left to surface as an unhandled rejection with nothing to tie it back to
            // this key.
            void apiKeyRepository.touchLastUsed(String(apiKey._id)).catch((error: unknown) => {
                logger.warn({
                    message: 'Could not stamp the last-used time on an api key.',
                    apiKeyId: String(apiKey._id),
                    error
                });
            });

            const permissions = currentCaller
                ? apiKey.permissions.filter((key) => holdsKey(currentCaller, key))
                : [];

            return {
                caller: assembleCaller(
                    apiKey.createdByUserId,
                    apiKey.tenant,
                    'tenant',
                    permissions
                ),
                credentialId: displayIdOf(apiKey.publicPrefix)
            };
        });
    });
};
