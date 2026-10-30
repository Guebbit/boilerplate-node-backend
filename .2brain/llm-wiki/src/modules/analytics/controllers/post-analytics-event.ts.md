---
source: src/modules/analytics/controllers/post-analytics-event.ts
sha256: 03ce0b7743835127eef1ed09c0cb5c7c3f33272e902e5e40f9ef6718b7ee24f5
generated_at: 2026-10-29T03:11:13.043046+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/controllers/post-analytics-event.ts

## Purpose

HTTP controller for `POST /analytics/events`. Validates the request body against a closed set of browsing-event schemas, hands a valid event to the analytics service for optional relay, and always returns **204 No Content** so the client can never distinguish whether the event was stored or dropped.

## Key elements

- **`postAnalyticsEvent(request, response)`** — the sole export. Parses the body with the `CreateAnalyticsEventBody` Zod schema, calls `analyticsService.relayEvent(body, callerContextOf(request))`, then ends the response with 204. Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/analytics/routes.ts`** — registers this controller on the `POST /analytics/events` route.
- **`src/modules/analytics/services/index.ts`** — source of `analyticsService`; its `relayEvent` method decides (based on consent) whether the event is forwarded to a provider or silently discarded.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation + 422 short-circuit) and `catchAs` (unified error→response mapping).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, which extracts IP/UA metadata attached to the incoming request for downstream privacy or consent checks.
- **`src/types/index.ts`** — exports the `AnalyticsEventRequest` type used in the Express handler signature.

## Notes

- The 204 response is intentionally **identical** for consented and non-consented paths; never add status-code or header differences, as that would leak whether a visitor's event was recorded.
- `analyticsService.relayEvent` is called inside a `Promise.resolve().then(…)` chain rather than awaited directly — this keeps the handler synchronous from the caller's perspective while still routing rejections through `catchAs`.
- The body schema is a *closed* union: any field outside the defined event types yields a 422 before any service logic runs.
