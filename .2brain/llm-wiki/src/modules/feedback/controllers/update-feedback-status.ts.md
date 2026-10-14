---
source: src/modules/feedback/controllers/update-feedback-status.ts
sha256: 267bb09f0da60d0cefbf462bba7d101e775ff7150bc10ed7573430758e82380e
generated_at: 2026-10-14T15:49:14.656056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/update-feedback-status.ts

## Purpose

Provides the `PUT /feedback/:id` (replace) and `PATCH /feedback/:id` (merge) admin handlers for updating a feedback ticket's status and notes. Both handlers are generated in a single `createUpdateController` call, keeping the replace/patch pair co-located and consistent.

## Key elements

- **`replaceFeedbackStatus`** — the `PUT` handler. Validates the full body against `ReplaceFeedbackRequestStatusBody`, then delegates to the service.
- **`updateFeedbackStatus`** — the `PATCH` handler. Validates the partial body against `UpdateFeedbackRequestStatusBody`, then delegates to the same service method.
- **`createUpdateController` options object** — configures the factory: `entity: 'feedbackStatus'`, `versioned: false`, a shared `update` callback that calls `feedbackRequestService.updateStatusById(id, changes, callerContextOf(request))`, and a `present` callback that wraps the result row with `presentFeedbackRequest`.

## Relationships

- **`@infrastructure/surfaces/create-update-controller`** — supplies the `createUpdateController` factory that turns the config object into the two exported handler functions.
- **`@infrastructure/http/request`** — supplies `callerContextOf(request)`, which extracts caller identity/context passed into the service for auditing.
- **`@modules/feedback/service`** — supplies `feedbackRequestService.updateStatusById`, the actual business-logic method that persists the status/notes change and records the audit entry.
- **`@modules/feedback/presenter`** — supplies `presentFeedbackRequest`, which shapes the service row into the API response envelope.
- **`@modules/feedback/routes`** — consumer side: imports the two handlers and mounts them on the feedback router for the `PUT` and `PATCH` verbs.

## Notes

- `versioned: false` means no API-version prefix is applied to this pair; the routes are expected to be unversioned.
- `notFoundKey` is the generic `'generic.error-not-found'` rather than a feedback-specific key, so a missing ticket returns the same message as any other 404 in the system.
- The `update` callback is **shared** between PUT and PATCH; the only distinction between the two verbs is the Zod schema (full vs. partial body) that `createUpdateController` enforces before calling it.
- `callerContextOf(request)` is the standard pattern for propagating audit context into the service layer — do not pass raw `request` down.
