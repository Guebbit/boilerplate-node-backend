---
source: src/modules/notifications/services/index.ts
sha256: c7858ae39b22269a9251828626c91851f0c8ea4060162e616a14e0075ce98180
generated_at: 2026-11-08T06:33:22.709263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/index.ts

## Purpose

Barrel/facade for the notifications service layer. It aggregates the functions from `inbox`, `staff`, `stream`, and `subscribers` into a single `notificationsService` object so that controllers and sibling modules have exactly one import point, never reaching into the individual files directly.

## Key elements

- **`notificationsService`** (const object) — the sole public API of the service. Maps short keys (`list`, `get`, `create`, `remove`, `readAll`, `dismissAll`, `stream`, `publishToUser`, `onTaskOpened`, etc.) to their implementations in the sibling service files.
- **Re-exported types** — `StaffLink`, `StaffRoute`, `StaffNoticeBody` (from `../staff-routing`) and `StaffNotice` (from `./staff`). Consumers import these types from this module rather than the original files.

## Relationships

- **Upstream (consumers):** All controllers in `src/modules/notifications/controllers/` (`get-notifications`, `get-notification`, `delete-notification`, `delete-notifications`, `post-read-all`, `get-notifications-stream`) import `notificationsService` from here. The module's `index.ts` and `module.ts` re-export it further to the rest of the app. Integration and contract tests also resolve the service through this file.
- **Downstream (dependencies):** Imports and re-exposes functions from `./inbox`, `./staff`, `./stream`, and `./subscribers`. No logic is implemented in this file; it is purely a composition surface.
- **`staff-routing.ts`** — type-only dependency; the three staff-routing types are re-exported so callers need a single import path.

## Notes

- The header comment and the docstring on `notificationsService` both state the convention: **callers must use `notificationsService` and never import the bare functions from `inbox.ts`, `staff.ts`, `stream.ts`, or `subscribers.ts` directly.** Adding a new service function requires adding it to this object to make it reachable.
- The file is annotated `@module`, signaling it is a namespace-style barrel rather than a utility module.
- No state, no side effects on import; the object is a plain reference map.
