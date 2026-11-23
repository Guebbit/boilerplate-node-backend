---
source: src/modules/api-keys/presenter.ts
source_sha256: ef87e3590341b0ebdabc6d9b184e277fce3a16fe51e285a92bc48eaad2324830
context_sha256: 8cc769cbbe8347f037e85c443eb0237fd20e97ed79bb46a0787b3526d76fb140
generated_at: 2026-11-22T04:22:28.119578+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/presenter.ts

## Purpose
Converts a stored API-key credential into the wire shape declared by `openapi.yaml`, and computes a key's effective status. It is the single place where a stored credential becomes the contract's `ApiKey`. The plaintext `secret` is not handled here: `mint()` in `src/modules/api-keys/services/api-keys.ts` adds it on top of this shape, since a secret is minted and never stored.

## Key elements
- `apiKeyStatus(key, minterCanSignIn)`: returns `ApiKey['status']`. It takes a `Pick<StoredApiKey, 'revokedAt' | 'expiresAt'>` and checks in this order:
  1. `revokedAt` set → `'revoked'`
  2. `expiresAt <= now` → `'expired'`
  3. otherwise `'active'` if `minterCanSignIn`, else `'suspended'`
- `presentApiKey(document)`: calls `document.toJSON()` on an `ApiKeyDocument` and casts the result to `StoredApiKey`.

## Relationships
- `src/modules/api-keys/model.ts` (`ApiKeyDocument`): input type for `presentApiKey`. The model's schema transform already renames `_id` to `id` and drops `hash`, so the presenter does no field mapping.
- `src/modules/api-keys/repository.ts` (`StoredApiKey`): the return type of `presentApiKey` and the basis for the `key` parameter of `apiKeyStatus`.
- `src/types/index.ts` (`ApiKey`, imported via `@types`): the contract type. `ApiKey['status']` is the return type of `apiKeyStatus`.
- `src/modules/api-keys/services/api-keys.ts`: `mint()` builds on the presented shape by adding the plaintext `secret`.

## Notes
- The cast in `presentApiKey` only narrows `toJSON()`'s return type, which is the schema's own overload and not the module's wire type. The function does no transformation.
- `toJSON` leaves no date or id objects (see `serialize.ts`). The contract tests check the rest.
- `'suspended'` depends on the minter being unable to sign in (banned, soft-deleted or erased). It is not final: an unban brings the key back to `'active'`. Revoked and expired are final.
- `apiKeyStatus` takes `minterCanSignIn` as an argument and does not look it up itself.
