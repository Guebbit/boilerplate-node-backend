---
source: src/modules/analytics/controllers/post-analytics-event.ts
sha256: 93a4d471d6839c394014e8eddc0b5db613950eea63576710457ffa9bfd9d208e
generated_at: 2026-10-14T14:54:51.833407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/controllers/post-analytics-event.ts

## Purpose

Handler for `POST /analytics/events`. Validates an incoming browsing event against a closed zod schema, then delegates to the analytics relay service. Deliberately returns the same `204` whether or not the event was actually forwarded, so the client can never detect whether measurement occurred.

## Key elements

- **`postAnalyticsEvent(request, response)`** — The sole export. Parses the body with `CreateAnalyticsEventBody` (rejecting with `422` on failure), then calls `relayEvent(body, callerContextOf(request))` and ends the response with `204`. Errors during the relay phase are funneled through `catchAs`.
- **`AnalyticsEventRequest`** — Imported from `@types`; parameterises the Express `Request` generic so the validated body type flows through.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (schema validation + 422 short-circuit) and `catchAs` (unified error-response formatting in the `.catch` handler).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts caller metadata from the request to pass alongside the event into the relay.
- **`src/modules/analytics/routes.ts`** — Registers `postAnalyticsEvent` as the handler for the `POST /analytics/events` route.
- **`src/modules/analytics/services/relay.ts`** — Provides `relayEvent`, the actual port that decides whether to forward the event based on consent.
- **`src/types/index.ts`** — Exports the `AnalyticsEventRequest` type used to type the Express request parameter.

## Notes

- The uniform `204` is a **privacy-by-design** choice, not a bug: a `200` vs `204` split would leak consent state to the page.
- `relayEvent` is called inside a `Promise.resolve().then(...)` chain rather than with `async/await`, which means any synchronous throw from `relayEvent` is still caught, but it also means the function is not `async`—callers receive a `Promise<void>` only via the `.catch` tail.
- Validation is the only gate here (422 on unknown event shapes); all consent/forwarding logic lives downstream in the relay service.
