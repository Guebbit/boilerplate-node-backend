---
source: src/modules/example/routes.ts
sha256: 04fabc72aa6232521cb5a45fcf365f420b95a6b3b5fd78f7fad418c4e08adc8f
generated_at: 2026-10-29T03:54:38.596896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/routes.ts

## Purpose

Route table for the example module. Declares every Express endpoint, partitions them into a public zone and an authenticated zone via a single positional `router.use(getAuth, isAuth)` guard, and wires the required middleware (permissions, caching, rate-limiting, idempotency, upload) in front of each controller handler.

## Key elements

- **`router`** (exported) — the `express.Router` instance mounted by the module. All routes live on it.
- **Auth boundary** — `router.use(getAuth, isAuth)` splits the file: the single route above it (`GET /:id`) is public; every route below requires a signed-in session.
- **`GET /:id`** — read one example. Public, uses `privateNoCache` + `previewDraftLanguage`.
- **`POST /search`** — search examples. Authenticated, `noStore`.
- **`GET /`** — list the caller's own examples. Authenticated, `privateNoCache`.
- **`POST /`** — create an example. Authenticated, `createExampleLimiter` → `idempotencyKey` → controller.
- **`PUT /:id`** — full replace (`replaceExample`).
- **`PATCH /:id`** — partial update (`updateExample`).
- **`POST /:id/publish | /archive | /unarchive`** — one route per lifecycle event, all mapped to handlers from `post-example-event`.
- **`DELETE /:id`** — remove the example.
- **`PUT /:id/cover`** — upload a cover image; `uploadLimiter` → `upload.image()` → controller.

## Relationships

- **Controllers** (`./controllers/*`): each handler is the terminal middleware on its route. `post-example-event` supplies three separate exports (`postExamplePublish`, `postExampleArchive`, `postExampleUnarchive`). `update-example` supplies two (`replaceExample`, `updateExample`).
- **`authorizations.ts`**: provides `getAuth`, `isAuth`, `requirePermission` — the auth/permission chain on every route.
- **`locale-preview.ts`**: `previewDraftLanguage` is prepended to all three read routes.
- **`cache.ts`**: `privateNoCache` on reads whose response varies by caller; `noStore` on the search POST.
- **`rate-limit.ts`**: `uploadLimiter` guards the cover-upload route.
- **`idempotency.ts`**: `idempotencyKey` on the create route.
- **`upload.ts`**: `upload.image()` parses the multipart body for the cover route.
- **`rate-limits.ts`**: `createExampleLimiter` is a per-module budget check placed before any write.
- **`module.ts`**: mounts or re-exports this `router` for the application.

## Notes

- **Positional auth, not per-route flags.** A route's auth requirement is determined solely by whether it is typed above or below the `router.use(getAuth, isAuth)` line. There is no `skipAuth` option.
- **`isAuth` over `isAuthOrCredential`.** API keys resolve to no session, so own-rows narrowing (which filters by the requesting user) would silently return nothing.
- **Route order matters.** `POST /search` is declared before `POST /:id`-style patterns so the literal word `search` is not captured as an `:id` parameter.
- **Limiter before idempotency.** A 429 emitted by the limiter sits *before* `idempotencyKey`; if reversed, the 429 body would be recorded in the idempotency ledger and replayed as the "result" on retry.
- **`uploadLimiter` before `upload.image()`.** A rate-limited request is rejected before any file is written to disk.
- **No `If-Match` on lifecycle events.** The controller reads the current status and conditions the write on it, so two racing publish/archive calls serialize naturally.
- **`previewDraftLanguage` is uncached.** It can change the visible title based on a draft language, so it is always paired with a no-cache or private cache directive.
