---
source: src/modules/notifications/routes.ts
source_sha256: 4dc34bdc0b925c79731b37765a5edc1ff47d096954dda4888a87ba2f87d5a854
context_sha256: 044acf5618b72b0387d4db10472fdfb9941e8ba82a5b1af0aea88bd3e69c54f5
generated_at: 2026-11-22T05:55:11.779094+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/routes.ts

## Purpose
Defines the Express route table for the notifications module, mounted at `/notifications`. Every route needs only a signed-in account. Inboxes are scoped to the caller by the service, so the module declares no permission rule.

## Key elements
- `router` — the exported Express `Router`, mounted at `/notifications`.
- `GET /stream` — the live SSE stream (`getNotificationsStream`), opened by the browser's `EventSource`. It is guarded by `requireAllowedOrigin` and `requireSessionViaCookie()`.
- `router.use(getAuth, isAuth)` — from this point down, routes use the ordinary bearer-authenticated chain.
- `GET /` — `getNotifications`.
- `POST /read-all` — `postReadAll`. Zeroes the badge and keeps the messages (only `readAt` changes).
- `DELETE /` — `deleteNotifications`. Empties the inbox. It is a delete because membership changes.
- `GET /:id` — `getNotification`, one of the caller's own.
- `DELETE /:id` — `deleteNotification`, one of the caller's own.

## Relationships
- `@kernel/middlewares/authorizations` (`src/kernel/middlewares/authorizations.ts`) supplies `getAuth` and `isAuth` for the bearer chain, and `requireSessionViaCookie` for the stream.
- `@infrastructure/http/middlewares/origin` (`src/infrastructure/http/middlewares/origin.ts`) supplies `requireAllowedOrigin`, applied only to the stream.
- The six handlers come from `./controllers/` (`get-notifications`, `get-notifications-stream`, `post-read-all`, `delete-notifications`, `get-notification`, `delete-notification`).
- `src/modules/notifications/module.ts` is a neighbor in the graph. The mount at `/notifications` is described only by a comment in this file.
- `src/modules/notifications/tests/unit/routes.test.ts` covers this route table.

## Notes
- **Order matters.** The stream is registered before `router.use(getAuth, isAuth)` because it authenticates by refresh cookie, not by bearer header. Moving it below the bearer chain would silently break it.
- The stream is cookie-authenticated, so `requireAllowedOrigin` is what stops a page on another origin from opening it.
- `GET /:id` and `DELETE /:id` come after the literal paths (`/read-all`, `/`) so that a literal path is never read as an id.
- Ownership is enforced by the service, not by a permission rule in this file.
