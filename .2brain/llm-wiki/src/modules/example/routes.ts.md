---
source: src/modules/example/routes.ts
sha256: 04fabc72aa6232521cb5a45fcf365f420b95a6b3b5fd78f7fad418c4e08adc8f
generated_at: 2026-11-08T05:52:27.716338+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/routes.ts

## Purpose

The route table for the example module. It declares every HTTP endpoint (GET, POST, PUT, PATCH, DELETE) for example resources, wires each to its controller, and orders authentication, authorization, caching, rate-limiting, and idempotency middlewares per route. Positional placement relative to `router.use(getAuth, isAuth)` is the sole mechanism that separates public routes from signed-in routes.

## Key elements

- **`router`** (exported) — the single Express `Router` instance mounted by the module; all endpoints live on it.
- **`GET /:id`** — public read; uses `getAuth` (no `isAuth`) so the service layer can return a draft to its owner or a published example to anyone. Applies `previewDraftLanguage` and `privateNoCache`.
- **`router.use(getAuth, isAuth)`** — the single auth boundary. Every route declared *below* this line requires a signed-in session.
- **`POST /search`** — must appear before `GET /:id` in the signed-in block so the literal word "search" is not captured as an `:id`.
- **`POST /`** — creation; order is `createExampleLimiter → idempotencyKey → postExample` so a 429 is never replayed as a successful idempotent response.
- **`PUT /:id` / `PATCH /:id`** — full replace vs. partial update, both requiring `update` permission.
- **`POST /:id/publish|archive|unarchive`** — one route per lifecycle event; each requires `update`.
- **`DELETE /:id`** — requires `delete` permission.
- **`PUT /:id/cover`** — image upload; order is `uploadLimiter → upload.image() → putExampleCover` so a refused request never writes a file.
- **`requirePermission(action, 'Example')`** — per-route authorization check (read / create / update / delete).

## Relationships

- **`src/modules/example/module.ts`** — mounts `router` into the application; the only consumer of this file's export.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission`, used on every route.
- **`src/kernel/middlewares/locale-preview.ts`** — provides `previewDraftLanguage`, applied to the three read routes (`GET /:id`, `POST /search`, `GET /`).
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore` (POST search) and `privateNoCache` (GET routes) to control browser/proxy caching.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `uploadLimiter` for the cover route and `createExampleLimiter` (re-exported from `rate-limits.ts`) for creation.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`, applied only to `POST /`.
- **`src/infrastructure/http/middlewares/upload.ts`** — provides `upload.image()`, applied only to `PUT /:id/cover`.
- **`src/modules/example/rate-limits.ts`** — exports `createExampleLimiter`, a module-specific limiter for the create endpoint.
- **Controllers** (`get-example`, `get-examples`, `post-example`, `post-example-event`, `update-example`, `delete-example`, `put-example-cover`) — each is the terminal handler for one or more routes; this file only sequences middleware around them.

## Notes

- **Positional auth, not per-route flags.** A route is public *only* if it is declared above `router.use(getAuth, isAuth)`. Moving a route across that line silently changes its auth requirement.
- **`getAuth` vs `isAuth` on the public route.** `GET /:id` deliberately uses `getAuth` alone (resolves identity if present, doesn't require it) so the service can branch on ownership. Do not "fix" this to `isAuth`.
- **Route ordering is load-bearing.** `POST /search` must precede any `:id`-pattern POST or the word "search" will be captured as an id.
- **Limiter-before-idempotency.** Placing `createExampleLimiter` before `idempotencyKey` ensures a 429 is not recorded in the idempotency ledger and replayed as a success on retry.
- **Limiter-before-upload.** `uploadLimiter` runs before `upload.image()` so a rate-limited request never produces an orphaned file on disk.
- **No `If-Match` on lifecycle POSTs.** The conditional write is enforced inside the controller by reading current status; two racing moves cannot both succeed.
