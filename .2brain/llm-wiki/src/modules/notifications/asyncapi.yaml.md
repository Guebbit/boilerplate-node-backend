---
source: src/modules/notifications/asyncapi.yaml
sha256: 92001e4fd489630295752bf9a518d37124d7198c7d2e0761384bbbf83f1bf749
generated_at: 2026-11-08T06:30:05.383056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/asyncapi.yaml

## Purpose

Self-contained AsyncAPI 3.0.0 contract for the per-user SSE stream served at `/notifications/stream`. It is a complete document (with its own server, channels, operations, and components) so it can be linted independently (`npm run lint:asyncapi:modules`) and read standalone; a bundler merges its contents into the repo-root contracts at build time.

## Key elements

- **Server `sseNotificationsLocal`** — local HTTP server declaration for the SSE endpoint. Declared here (not shared with the observability module) because the bundler assigns a server to exactly one section and a server-less document fails standalone lint.
- **Channels** — three, all tagged `x-transport: sse` (the extension `scripts/contracts/generate-asyncapi-types.ts` uses to select SSE channels):
  - `notifications.created` — a new notification was written for the connected user.
  - `notifications.deleted` — one or more notifications were removed (user delete, bulk delete, or cap-trim).
  - `notifications.read` — notifications were marked read (badge clear).
- **Operations** — three `send` actions (`sseNotificationCreated`, `sseNotificationsDeleted`, `sseNotificationsRead`) describing when each frame is pushed and the payload semantics (e.g., `all: true` when the entire inbox is emptied; filtered deletes may name ids the tab never held).
- **Components → Messages** — `NotificationCreatedEvent`, `NotificationsDeletedEvent`, `NotificationsReadEvent`, each pointing to a payload schema.
- **Components → Schemas** — concrete notification payload variants (`NotificationStaffWebhookDisabledPayload`, `NotificationStaffTaskOpenedPayload`, `NotificationStaffTaskOverduePayload`, `NotificationStaffTaskDueSoonPayload`, `NotificationStaffTaskAssignedPayload`, etc.) plus their nested `*ParamsPayload` objects. All use `additionalProperties: false`.
- **`x-extends` fragment convention** — modules that add new notification types append their payloads via this extension.

## Relationships

- **`src/modules/notifications/module.ts`** — the runtime module that implements the SSE endpoint described here. It produces the typed events defined in this document; the producer is typed against both this AsyncAPI contract and the sibling `openapi.yaml` to keep them in sync.

## Notes

- Schemas intentionally **mirror** (not `$ref`) the `Notification` types in `./openapi.yaml`. This duplication is required so the AsyncAPI document validates and generates types independently.
- Schema members are listed **before** any union that references them, because the generated Zod schemas are `const` declarations (forward references would fail).
- The `x-transport: sse` extension is load-bearing: the type-generation script keys off it to pick which channels get SSE typings.
- The per-user cap can trim the oldest notification; the trimmed item arrives as a `notifications.deleted` frame immediately after the corresponding `notifications.created` frame.
