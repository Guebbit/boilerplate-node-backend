---
source: src/modules/webhooks/services/read-refusal.ts
sha256: a8d66583dfb0d2439c1c350ce0d08fe2c30b4f344b120b9338d99277228b9a4e
generated_at: 2026-11-14T22:47:54.069086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/read-refusal.ts

## Purpose

Centralised 403 refusal response for the "caller may not read that event" case. Shared by every webhook write that hands an event stream to a receiver (create, update, secret rotation) and by replay, so the error shape, code, and message live in exactly one place.

## Key elements

- **`rejectEventReadRequired(names: readonly string[]): ResponseReject`** — Builds a 403 response carrying the `WEBHOOK_EVENT_READ_REQUIRED` error code and an i18n-ised message that lists the unreadable event names (comma-joined). The sole public export of the module.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` (to construct the 403 envelope) and the `ResponseReject` type used as the return type.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports the `t` translator to localise the message under the key `webhooks.event-read-required`.
- **`src/modules/webhooks/services/subscriptions.ts`** — Expected caller for the create / update / secret-rotation paths.
- **`src/modules/webhooks/services/deliveries.ts`** — Expected caller for the replay path.

## Notes

- The module is annotated `@module` (no default export); consumers import the named `rejectEventReadRequired` directly.
- The `names` parameter is typed `readonly string[]`, so callers can pass a `ReadonlyArray` without copying.
- The i18n key `webhooks.event-read-required` receives a single interpolation slot (`names`); the joining to a comma-separated string happens in this file, not in the locale template.
