---
source: src/modules/analytics/controllers/post-analytics-event.ts
source_sha256: 723a85e5a26e2d999f4507d3ae375972fb2da17bd86377533155ccff370eadbf
context_sha256: dfeb79c710aaf938ccfae89702a5d3ac7804b40fbbb14dc04451757059621116
generated_at: 2026-11-22T04:17:38.789229+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/controllers/post-analytics-event.ts

## Purpose
Express controller for the public `POST /analytics/events` endpoint. It validates a browsing event from the request body and hands it to the analytics service, always answering `204` on success. Whether the event is actually recorded (e.g. visitor consent) is decided downstream by the analytics port, so the response never reveals whether a page was measured.

## Key elements
- `postAnalyticsEvent(request, response)`: the exported handler.
  - Parses `request.body` with `parseBody(CreateAnalyticsEventBody, ...)`. If parsing fails it returns early (the body is a closed set of events; anything else is a 422, per the module docs).
  - Calls `analyticsService.relayEvent(body, callerContextOf(request))`, then sends `204` with no body.
  - Wraps the work in a promise chain with `.catch(catchAs(response, 'postAnalyticsEvent'))` for error handling.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody` (schema validation against the response) and `catchAs` (error-to-response mapping, labelled `'postAnalyticsEvent'`).
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which derives the caller context passed to the service.
- `src/modules/analytics/services/index.ts`: supplies `analyticsService`, whose `relayEvent` receives the event and caller context.
- `src/types/index.ts`: supplies the `AnalyticsEventRequest` type for the request body.
- `src/modules/analytics/routes.ts`: the route wiring for `POST /analytics/events` (the handler is meant to be mounted there).

## Notes
- The handler returns `undefined` on validation failure and a promise otherwise.
- `relayEvent` is called without `await` or return value handling, so the 204 doesn't depend on its result. Synchronous throws are still caught, because the call sits inside a `.then`.
- The validation schema `CreateAnalyticsEventBody` comes from `@api/schemas.zod`.
- Further context is in `src/modules/analytics/module.ts`.
