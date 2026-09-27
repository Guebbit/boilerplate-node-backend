/**
 * @module
 * The one place a stored credential becomes the wire shape `openapi.yaml` declares. `mint()` in
 * `./services/api-keys.ts` layers the plaintext `secret` on top of this same shape — a secret is
 * minted, never stored, so it cannot come from the document itself.
 */

import type { ApiKey } from '@types';
import type { ApiKeyDocument } from './model';

/**
 * A stored credential, mapped to the contract's `ApiKey` — `model.ts`'s own schema transform
 * already applies the `_id` → `id` rename and drops `hash`; the cast narrows `toJSON()`'s return
 * type, which is the schema's own overload, not this module's wire type.
 */
export const presentApiKey = (document: ApiKeyDocument): ApiKey => document.toJSON() as ApiKey;
