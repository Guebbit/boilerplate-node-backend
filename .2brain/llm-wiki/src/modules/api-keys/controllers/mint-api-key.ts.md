---
source: src/modules/api-keys/controllers/mint-api-key.ts
sha256: 10efd312a6bbfb157f3fb0e13f4f8d8d210e1163226780abde75308457a35913
generated_at: 2026-09-23T18:23:41.812938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/mint-api-key.ts

## Purpose

HTTP controller for `POST /api-keys`. Validates the request body against a Zod schema, extracts the tenant/caller context, delegates to the API-keys service to mint a new credential, and shapes the HTTP response (201 on success, 422 on refusal).

## Key elements

- **`mintApiKey`** (exported function) — The sole handler for `POST /api-keys`. Pipeline:
  1. `parseBody(MintApiKeyBody, …)` — validates the JSON body; returns early (no response) on schema failure.
  2. `tenantCallerContextOf(request)` — extracts the authenticated caller's identity/permissions.
  3. `apiKeysService.mintApiKey(body, context)` — performs the actual key creation and permission-subset check.
  4. `refused(response, result)` — if the service rejects (e.g. 422 naming offending permission keys), sends that response and stops.
  5. `successResponse(response, data, 201)` — on success, returns the created key with **201 Created**.
  6. `.catch(catchAs(response, 'mintApiKey'))` — catches thrown errors into a standard error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the `parseBody`, `refused`, and `catchAs` helpers used in the handler pipeline.
- **`src/infrastructure/http/request.ts`** — supplies `tenantCallerContextOf`, which pulls caller identity out of the Express request.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the shared 2xx formatter.
- **`src/modules/api-keys/services/index.ts`** — source of `apiKeysService`; the service owns the permission-subset validation and key generation logic.
- **`src/modules/api-keys/routes.ts`** — graph neighbor; expected to wire `mintApiKey` to the `POST /api-keys` route.
- **`src/types/index.ts`** — source of the `MintApiKeyRequest` (body type) and `ApiKeyCreated` (response payload) types.

## Notes

- Success is **201**, not 200 — the endpoint creates a resource.
- The service (not the controller) enforces that requested `permissions` are a subset of the caller's own; violations produce a 422 that names the offending keys. The controller simply passes the refusal through via `refused()`.
- `parseBody` early-returns without sending a response when validation fails — the calling infrastructure is responsible for the 400.
- The function is a plain async-style handler (`.then`/`.catch`), not `async`/`await`, matching the project's controller convention.
