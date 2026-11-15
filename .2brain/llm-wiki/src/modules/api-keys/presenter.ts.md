---
source: src/modules/api-keys/presenter.ts
sha256: be23ee9702b23a3938b21671c7c2f739e85c40658b996e5ef9617bc20b726631
generated_at: 2026-11-14T19:20:48.537784+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/presenter.ts

## Purpose

The single mapping point from a stored credential document to the wire shape declared in `openapi.yaml`. It isolates the "document → API contract" translation so that neither the model schema nor the service layer has to re-derive the `ApiKey` shape.

## Key elements

- **`apiKeyStatus(key, minterCanSignIn)`** — Resolves the effective status of a stored key by priority: `revoked` → `expired` → `suspended` / `active`. The last branch depends on whether the minter can still sign in (not banned, soft-deleted, or erased).
- **`presentApiKey(document)`** — Calls `document.toJSON()` and casts the result to `StoredApiKey`. The actual field renaming (`_id` → `id`) and `hash` removal happen inside the Mongoose schema transform in `model.ts`; this function only narrows the return type.

## Relationships

- **`src/modules/api-keys/model.ts`** — Supplies `ApiKeyDocument`, whose `toJSON()` overloads carry the field-level transforms that `presentApiKey` relies on.
- **`src/modules/api-keys/repository.ts`** — Supplies the `StoredApiKey` type (the post-transform shape this module returns).
- **`src/types/index.ts`** — Supplies the `ApiKey` wire type; `apiKeyStatus` returns `ApiKey['status']`.
- **`src/modules/api-keys/services/api-keys.ts`** — Its `mint()` function produces the same `ApiKey` shape but overlays the plaintext `secret`, which by design never exists in a stored document.

## Notes

- The `as StoredApiKey` cast in `presentApiKey` is a type-narrowing over the schema's own `toJSON()` overload, not a redefinition of the wire type. Don't treat it as a runtime check.
- `apiKeyStatus` takes only `revokedAt` and `expiresAt` from `StoredApiKey` (via `Pick`), so callers can pass a partial row without pulling the full document.
- A credential's `secret` is minted at issuance and never persisted; it therefore cannot appear in anything this module produces.
