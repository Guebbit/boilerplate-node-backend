---
source: src/modules/locales/controllers/get-entity-translations.ts
sha256: 3ec13bd5a2302f58111eb1a7019f95c40413aa35d93298a1c98417befe018ae4
generated_at: 2026-09-23T18:48:21.645168+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose
Thin HTTP adapter for the admin endpoint `GET /locales/translations/:entityType/:id`. It extracts the two path parameters, delegates to `localeService.getEntityTranslations`, and maps the service result onto an HTTP response (success or refusal). Contains no business logic.

## Key elements
- **`getEntityTranslations`** (exported function) — Express handler that reads `entityType` and `id` from `request.params`, calls `localeService.getEntityTranslations(entityType, id)`, then either short-circuits via `refused` (service-signalled rejection) or sends `successResponse(response, result.data)`. Errors are funneled through `catchAs(response, 'getEntityTranslations')`.

## Relationships
- **`src/modules/locales/services/index.ts`** — Provides `localeService`, whose `getEntityTranslations` method is the sole data source this controller calls.
- **`src/infrastructure/http/controller.ts`** — Supplies the `catchAs` (error→response wrapper) and `refused` (result-check that writes a refusal status and returns a truthy sentinel to skip the success branch) utilities.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standardized 200-shape writer.
- **`src/modules/locales/routes.ts`** — Registers `getEntityTranslations` as the handler for the corresponding route path.

## Notes
- JSDoc marks the endpoint as **admin**-scoped; the actual auth guard lives in the route definition, not here.
- `refused` is a *result-check* pattern (not an exception): the service returns a tagged refusal, and the controller checks it before calling `successResponse`. A caller reading only the `catch` block will miss this failure path.
- The operation name passed to `catchAs` (`'getEntityTranslations'`) is likely used for structured logging/tracing downstream.
