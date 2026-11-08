---
source: src/modules/api-keys/controllers/get-api-key.ts
sha256: 0751d9c16d8f884de1f6316098959eb9987819c68c3ce6c21cfff7f9ee613ec2
generated_at: 2026-11-08T05:01:43.286062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/get-api-key.ts

## Purpose

HTTP controller that handles `GET /api-keys/:id`. It validates the route parameter, looks up a single API key scoped to the caller's tenant via the service layer, and returns the key's metadata (never its secret). All failure modes—malformed id, unknown id, cross-tenant access—produce an identical 404 to avoid leaking existence.

## Key elements

- **`getApiKey(request, response)`** — The sole export. Extracts and validates `:id`, calls `apiKeysService.getApiKey` with the tenant caller context, then either sends a `200` with the `ApiKey` payload or a `404`/error via the `refused`/`catchAs` helpers.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error envelope) and `refused` (service-level rejection → 404).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which validates the `:id` param and short-circuits with a generic 404 if malformed.
- **`src/infrastructure/http/request.ts`** — Supplies `tenantCallerContextOf`, which derives the tenant-scoped caller context from the request for service-layer authorization.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard shape for 200 JSON replies.
- **`src/modules/api-keys/routes.ts`** — Registers `getApiKey` on the `GET /api-keys/:id` route.
- **`src/modules/api-keys/services/index.ts`** — Exposes `apiKeysService.getApiKey(id, callerContext)`, which performs the actual lookup and tenancy check.
- **`src/types/index.ts`** — Provides the `ApiKey` type used as the response payload type parameter.

## Notes

- The 404 body uses the i18n key `generic.error-item-gone` for malformed ids, and the `refused` helper returns the same shape for cross-tenant / not-found cases—deliberately indistinguishable to the caller.
- The handler is a plain function (not a class method), consistent with the module's functional style.
- `requireId` returning a falsy value causes an early `Promise.resolve()` return; no further service call is made.
