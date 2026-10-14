---
source: src/modules/api-keys/presenter.ts
sha256: f2c2b25d6d633b274f7bb9623ee4bdc86cbf272366d00e8280660c176ed6604e
generated_at: 2026-10-14T14:59:44.125150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/presenter.ts

## Purpose
Single-purpose mapping layer that converts a stored `ApiKeyDocument` into the `ApiKey` wire shape declared by `openapi.yaml`. It exists so that the document's schema-internal representation (with `_id`, `hash`, etc.) is isolated from the contract type, and so `mint()` in the service layer can layer a plaintext `secret` on top of the *same* shape without the secret ever being persisted on the document.

## Key elements
- **`presentApiKey(document: ApiKeyDocument): ApiKey`** — The sole export. Calls `document.toJSON()` (the Mongoose schema's own overload) and casts the result to the `ApiKey` contract type. No logic beyond the call + cast.

## Relationships
- **`src/modules/api-keys/model.ts`** — Provides the `ApiKeyDocument` input type. Its schema-level `toJSON` transform already handles the `_id` → `id` rename and strips `hash` before this function runs.
- **`src/types/index.ts`** — Provides the `ApiKey` output type (the `openapi.yaml` wire contract).
- **`src/modules/api-keys/services/api-keys.ts`** — `mint()` constructs the same `ApiKey` shape but additionally attaches a plaintext `secret` field; the secret is generated at mint time and never written back to the document.

## Notes
- The `as ApiKey` cast is necessary because `toJSON()` returns the Mongoose schema's own overload type, not the `ApiKey` contract type; they are structurally identical after the schema transform but nominally different. No runtime conversion happens here.
- Do not add secret-related logic to this file. By design a secret is *minted*, never stored, so it can only appear in the service layer's `mint()` path.
