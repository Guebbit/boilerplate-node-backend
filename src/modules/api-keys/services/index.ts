/**
 * @module
 * This module's `services/` barrel — one file, `api-keys.ts`, since the module has one resource.
 * `context.ts` is the one thing every operation needs from a caller.
 */

import * as apiKeys from './api-keys';

/** The module's barrel export — controllers call through this, never the bare functions. */
export const apiKeysService = {
    listApiKeys: apiKeys.list,
    mintApiKey: apiKeys.mint,
    revokeApiKey: apiKeys.revoke
};
