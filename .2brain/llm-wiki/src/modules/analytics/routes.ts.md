---
source: src/modules/analytics/routes.ts
source_sha256: 75ba3172381707d4153b150d28af3b557f054650d8bc83a0177ba0cb45cf5d85
context_sha256: 87aff848c28393c5ef9c9be2cf64f58465b0330c7317a8e840d1b6e9e701fc30
generated_at: 2026-11-22T04:18:15.233533+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/routes.ts

## Purpose
Defines the Express route table for the analytics relay. It exposes a single public write endpoint for browsing events, open to guests. Per the file's own doc comment, the route is bounded by the global burst brake in `src/app/security.ts`, it writes nothing itself, and without consent it does no work.

## Key elements
- `router` (exported): an Express `Router` for the analytics relay.
- `POST /events`: registered as `router.post('/events', getAuth, postAnalyticsEvent)`. It records one browsing event and returns 204 whether or not the event was recorded.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: supplies `getAuth`, the middleware that runs before the controller. It does not reject guests. It only lets a signed-in visitor's events carry their id.
- `src/modules/analytics/controllers/post-analytics-event.ts`: supplies `postAnalyticsEvent`, the handler that serves `POST /events`.
- `src/modules/analytics/module.ts`: a graph neighbor of this file. This file's content does not show how the two connect, but `router` is exported for module-level wiring.

## Notes
- The route is public by design, because guests are the ones browsing. `getAuth` is optional identification, not an access gate.
- The 204 response does not tell the client whether the event was recorded.
- Rate limiting is not applied here. It comes from the global burst brake in `src/app/security.ts`.
