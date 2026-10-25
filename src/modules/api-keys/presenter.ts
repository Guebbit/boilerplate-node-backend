/**
 * @module
 * The one place a stored credential becomes the wire shape `openapi.yaml` declares. `mint()` in
 * `./services/api-keys.ts` layers the plaintext `secret` on top of this same shape — a secret is
 * minted, never stored, so it cannot come from the document itself.
 */

import type { ApiKey } from '@types';
import type { ApiKeyDocument } from './model';
import type { StoredApiKey } from './repository';

/**
 * Whether a credential works right now, in the order the resolver refuses them: revoked and
 * expired are final, a minter who cannot sign in suspends it (an unban brings it back).
 *
 * @param key - the stored row
 * @param minterCanSignIn - the minter is neither banned, soft-deleted nor erased
 * @param now - the clock, injectable for tests
 */
export const apiKeyStatus = (
    key: Pick<StoredApiKey, 'revokedAt' | 'expiresAt'>,
    minterCanSignIn: boolean,
    now: Date = new Date()
): ApiKey['status'] => {
    if (key.revokedAt) return 'revoked';
    if (new Date(key.expiresAt) <= now) return 'expired';
    return minterCanSignIn ? 'active' : 'suspended';
};

/**
 * A stored credential, mapped to the contract's `ApiKey` — `model.ts`'s own schema transform
 * already applies the `_id` → `id` rename and drops `hash`; the cast narrows `toJSON()`'s return
 * type, which is the schema's own overload, not this module's wire type.
 */
export const presentApiKey = (document: ApiKeyDocument): StoredApiKey =>
    document.toJSON() as StoredApiKey;
