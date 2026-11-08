---
source: src/modules/analytics/controllers/post-analytics-event.ts
sha256: 03ce0b7743835127eef1ed09c0cb5c7c3f33272e902e5e40f9ef6718b7ee24f5
generated_at: 2026-11-08T04:58:37.115061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/controllers/post-analytics-event.ts

## Purpose
Single controller handler for the public `POST /analytics/events` endpoint. It validates the request body against a closed schema of browsing events, hands the event to the analytics service (which decides whether to relay it based on consent), and always responds `204` so the page can never tell whether its action was measured.

## Key elements
- **`postAnalyticsEvent(request, response)`** — the only export. Validates the body with `parseBody(CreateAnalyticsEventBody, …)`; on failure the response is already sent (422) and the function returns early. On success it calls `analyticsService.relayEvent(body, callerContextOf(request))` and ends the response with `204`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — imports `parseBody` (Zod body validation that auto-sends the error response) and `catchAs` (unified error responder attached to the `.catch` of the promise chain).
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to derive the caller's consent/context from the incoming request, passed to `analyticsService.relayEvent`.
- **`src/modules/analytics/routes.ts`** — the route table that wires this handler to the `POST /analytics/events` path.
- **`src/modules/analytics/services/index.ts`** — exports `analyticsService`, whose `relayEvent` method performs the actual (consent-gated) forwarding to the analytics provider.
- **`src/types/index.ts`** — exports the `AnalyticsEventRequest` type used to type the Express `Request` parameter.

## Notes
- **Uniform 204 response:** whether or not consent was granted, the client receives the same `204`. This is intentional and documented in the module JSDoc — the response must not leak tracking status.
- **Synchronous body handling inside a promise chain:** the handler is not `async`; it uses `Promise.resolve().then(…).catch(catchAs(…))` so that any synchronous throw inside the `.then` body is still funneled through `catchAs`.
- **`parseBody` short-circuit:** when validation fails, `parseBody` sends the 422 itself and returns `undefined`; the `if (!body) return;` guard prevents falling through to the promise chain.
- **Zod schema lives in `@api/schemas.zod`** (`CreateAnalyticsEventBody`), outside this module's directory.
