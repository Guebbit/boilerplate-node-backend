/**
 * @module
 * This module's `services/` barrel — `api-keys.ts` for the CRUD resource, `resolver.ts` for the
 * `CredentialResolver` `module.ts` installs into the kernel.
 */

import * as apiKeys from './api-keys';

/** The module's barrel export — controllers call through this, never the bare functions. */
export const apiKeysService = {
    listApiKeys: apiKeys.list,
    mintApiKey: apiKeys.mint,
    revokeApiKey: apiKeys.revoke
};

export { fromBearerToken as resolveApiKeyCredential } from './resolver';
