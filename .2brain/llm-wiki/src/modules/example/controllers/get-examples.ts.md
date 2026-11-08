---
source: src/modules/example/controllers/get-examples.ts
sha256: fa91c9545cd8355a37a37e627cb691011ad88437736717b81e50a76f2d02ab71
generated_at: 2026-11-08T05:48:40.962498+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-examples.ts

## Purpose
Thin wiring controller for the Example module's search surface. It defines a single search controller that serves both `GET /examples` and `POST /examples/search`, decoding the incoming request into a validated query and delegating the actual lookup to `exampleService.search`.

## Key elements
- **`searchExamplesQuerySchema`** – Extends the generated `SearchExamplesBody` schema, overriding `page` and `pageSize` with `pageSchema`/`pageSizeSchema` so they are coerced from query-string text into numbers.
- **`getExamples`** (exported) – The result of `createSearchController(…)`. Bound to entity `"examples"`; its `runSearch` callback calls `exampleService.search(parsed, callerContextOf(request))`. Handles both the GET and POST endpoints.

## Relationships
- **`@infrastructure/surfaces/create-search-controller`** – Provides the `createSearchController` factory that shapes the HTTP handler (parsing, error envelope, response formatting).
- **`@infrastructure/http/request`** – Source of `callerContextOf`, used to pass caller identity/permissions into the service call.
- **`@infrastructure/http/schemas`** – Supplies `pageSchema` and `pageSizeSchema` for query-parameter coercion.
- **`../services/index`** – Source of `exampleService`; the controller delegates all business logic here.
- **`src/modules/example/routes.ts`** – Consumes the `getExamples` export to register the endpoints on the router.

## Notes
- One controller covers **two** HTTP methods (`GET /examples` and `POST /examples/search`). The distinction is purely in how the client sends the body (query string vs. JSON body); the schema handles both.
- The `page`/`pageSize` coercion exists specifically because the GET form delivers them as raw query text; without the extended schema they would arrive as strings and fail downstream numeric assumptions.
- No business logic lives here — validation, auth context extraction, and response shaping are the only responsibilities, per the module's controller convention.
