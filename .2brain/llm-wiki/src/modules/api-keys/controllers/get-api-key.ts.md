---
source: src/modules/api-keys/controllers/get-api-key.ts
sha256: 0751d9c16d8f884de1f6316098959eb9987819c68c3ce6c21cfff7f9ee613ec2
generated_at: 2026-10-29T03:12:27.503823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/get-api-key.ts

## Purpose

Controller for the `GET /api-keys/:id` endpoint. Retrieves a single API key by ID scoped to the calling tenant, returning only the key metadata (never its secret). All failure modes — malformed ID, unknown ID, or another tenant's key — are collapsed into a uniform 404 to avoid leaking existence.

## Key elements

- **`getApiKey`** (exported function) — The sole handler. Extracts and validates the `:id` param, fetches the key via `apiKeysService.getApiKey(id, tenantCtx)`, then either responds 200 with the `ApiKey` payload or short-circuits on a 404 refusal.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error→response mapping) and `refused` (detects a rejected result to emit 404).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which parses the route param and short-circuits the handler with a 404 if it is missing/malformed.
- **`src/infrastructure/http/request.ts`** — Supplies `tenantCallerContextOf`, extracting the caller's tenant identity from the request.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard 200 JSON writer.
- **`src/modules/api-keys/routes.ts`** — Registers `getApiKey` as the handler for `GET /api-keys/:id`.
- **`src/modules/api-keys/services/index.ts`** — Source of `apiKeysService.getApiKey`, the actual data-fetch + tenant-scoping logic.
- **`src/types/index.ts`** — Defines the `ApiKey` shape returned in the success payload.

## Notes

- **Uniform 404 by design.** Malformed ID, non-existent ID, and cross-tenant access all produce the same `generic.error-item-gone` 404. Do not differentiate them in responses or logs at this layer.
- **Secret is never exposed.** The service contract guarantees the returned `ApiKey` omits the secret; this controller does no additional filtering.
- **Early return on bad ID.** When `requireId` fails, the handler returns `Promise.resolve()` immediately — the service is never called, avoiding an unnecessary DB hit.
