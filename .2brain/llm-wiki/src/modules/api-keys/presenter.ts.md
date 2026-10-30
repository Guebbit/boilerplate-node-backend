---
source: src/modules/api-keys/presenter.ts
sha256: a8fd56a3f400f3d6acbdcf550c1df427f70683a94689d906632d957785e2cc62
generated_at: 2026-10-29T03:13:50.991670+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/presenter.ts

## Purpose

Single location where a stored credential row is mapped to the wire shape declared in `openapi.yaml`. It exists so that the transformation logic (status resolution, document-to-contract casting) lives in one place rather than being scattered across controllers or serializers.

## Key elements

- **`apiKeyStatus(key, minterCanSignIn, now)`** — Pure function that resolves a credential's lifecycle status in priority order: `revoked` → `expired` → `active`/`suspended`. The minter's sign-in eligibility (not banned, soft-deleted, or erased) is the only external input; the clock is injectable for tests.
- **`presentApiKey(document)`** — Thin wrapper around `ApiKeyDocument.toJSON()` that casts the Mongoose schema overload's return to the narrower `StoredApiKey` type. The `_id` → `id` rename and `hash` removal are already handled by the schema's transform.

## Relationships

- **`./model.ts`** — Supplies the `ApiKeyDocument` type (the Mongoose document) consumed by `presentApiKey`.
- **`./repository.ts`** — Supplies the `StoredApiKey` type that both functions target as their output domain shape.
- **`@types` (`src/types/index.ts`)** — Supplies `ApiKey`, the OpenAPI contract type; `apiKeyStatus` returns its `status` field.
- **`./services/api-keys.ts`** — The `mint()` function layers a plaintext `secret` onto this same shape at creation time; after minting, the presenter is the sole path from storage to the wire.

## Notes

- `presentApiKey` is intentionally a one-liner cast; the real work (field rename, hash stripping) lives in the Mongoose schema's `toJSON` transform in `model.ts`. If you need to add a field, change the schema transform, not this file.
- `apiKeyStatus` compares `expiresAt` against `now` using `<=`, meaning a key is expired the instant its deadline is reached, not after.
- The module doc comment explicitly notes that a freshly minted secret is *not* recoverable from the document — `mint()` in the service composes the wire shape separately. Do not try to "present" a just-minted key through `presentApiKey`; it would lack the `secret`.
