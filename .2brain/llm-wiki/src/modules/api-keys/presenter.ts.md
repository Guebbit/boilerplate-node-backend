---
source: src/modules/api-keys/presenter.ts
sha256: a8fd56a3f400f3d6acbdcf550c1df427f70683a94689d906632d957785e2cc62
generated_at: 2026-11-08T05:03:23.535252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/presenter.ts

## Purpose

Maps a stored API-key credential into the wire shape declared in `openapi.yaml`. It exists as the single translation point between the persistence layer (Mongoose document / stored row) and the API contract type `ApiKey`, so that the rest of the codebase never has to know how the document is shaped internally.

## Key elements

- **`apiKeyStatus(key, minterCanSignIn, now)`** – Pure status resolver. Returns `'revoked' | 'expired' | 'active' | 'suspended'` in that precedence order. Takes only the `revokedAt`/`expiresAt` slice of a stored row, a boolean for whether the minter can sign in, and an injectable `Date` for testability.
- **`presentApiKey(document)`** – Adapts an `ApiKeyDocument` to `StoredApiKey` by calling `document.toJSON()` and casting the result. The actual field renames (`_id` → `id`) and drops (`hash`) are already handled by the schema transform in `model.ts`; this function merely narrows the overload on `toJSON()`.

## Relationships

- **`src/types/index.ts`** – Source of the `ApiKey` contract type (the `openapi.yaml` wire shape). `apiKeyStatus`'s return type is `ApiKey['status']`.
- **`src/modules/api-keys/model.ts`** – Supplies `ApiKeyDocument`. Its schema-level `toJSON` transform performs the `_id`/`hash` adjustments that `presentApiKey` relies on.
- **`src/modules/api-keys/repository.ts`** – Supplies the `StoredApiKey` shape that both exports return / consume.
- **`src/modules/api-keys/services/api-keys.ts`** – The `mint()` function there layers a plaintext `secret` onto the same shape this module produces. A secret is minted at creation time and never persisted, so it can only originate from that service, not from the document.

## Notes

- Status precedence is intentional and mirrors the resolver's refusal order: **revoked → expired → suspended/active**. An unban (restoring `minterCanSignIn`) re-activates a suspended key but cannot override revocation or expiry.
- The `now` parameter defaults to `new Date()` but is injectable specifically so tests can pin the clock without mocking globals.
- `presentApiKey` is a thin cast, not a field-by-field mapper. If the wire contract gains a field that the schema doesn't produce, the fix belongs in `model.ts`'s transform, not here.
