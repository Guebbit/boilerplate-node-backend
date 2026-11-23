---
source: src/modules/example/routes.ts
source_sha256: 0fe0948e4262c9056ab12ee15d2858b26ed6c95ca0808d0845087b9804f2779f
context_sha256: 4e4e60415a7b9c91e54b50194366dfe87185f756e15a41fc012d87adc95c8b58
generated_at: 2026-11-22T05:11:09.036401+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/routes.ts

## Purpose
The route table for the `example` module: an Express `Router` that wires HTTP endpoints to controllers and attaches, per route, the auth, permission, cache, rate-limit, idempotency and upload middleware each action needs. Public routes are declared above a single `router.use(getAuth, isAuth)`; everything below it requires a signed-in caller.

## Key elements
- `router` (exported): the Express `Router` for the example endpoints.
- `GET /:id`: the only open read. Uses `getAuth` without `isAuth`, so the caller is resolved if present and the service scopes the result (published is public, draft is owner-only). Uses `previewDraftLanguage` and `privateNoCache`, then `getExample`.
- `router.use(getAuth, isAuth)`: the positional auth guard. It covers only routes declared after it.
- `POST /search`: requires `read` on `Example`, then `previewDraftLanguage`, `noStore`, `getExamples`. It is declared before `/:id` so `search` is not read as an id.
- `GET /`: requires `read` on `Example`, then `previewDraftLanguage`, `privateNoCache`, `getExamples`. It lists the caller's own examples, filtered by the query string.
- `POST /`: requires `create`, then `createExampleLimiter`, `idempotencyKey`, `postExample`.
- `PUT /:id` calls `replaceExample`. `PATCH /:id` calls `updateExample`. Both require `update`.
- `POST /:id/publish`, `/archive` and `/unarchive`: require `update` and call `postExamplePublish`, `postExampleArchive` and `postExampleUnarchive`.
- `DELETE /:id`: requires `delete`, then `deleteExample`.
- `PUT /:id/cover`: requires `update`, then `uploadLimiter`, `upload.image()`, `putExampleCover`.

## Relationships
- **Controllers** (`controllers/get-example`, `get-examples`, `post-example`, `post-example-event`, `update-example`, `delete-example`, `put-example-cover`): the final handler on each route.
- **`@kernel/middlewares/authorizations`**: supplies `getAuth`, `isAuth` and `requirePermission(action, 'Example')`.
- **`@kernel/middlewares/locale-preview`**: supplies `previewDraftLanguage`, used on the three read routes (`GET /:id`, `POST /search`, `GET /`).
- **`@infrastructure/http/middlewares/cache`**: supplies `noStore` and `privateNoCache`.
- **`@infrastructure/http/middlewares/rate-limit`**: supplies `uploadLimiter` for the cover upload.
- **`./rate-limits`**: supplies `createExampleLimiter` for creation.
- **`@infrastructure/http/middlewares/idempotency`**: supplies `idempotencyKey` for creation.
- **`@infrastructure/http/middlewares/upload`**: supplies the `upload` object; its `image()` handler runs on the cover upload.

## Notes
- Placement decides access. A route is public or signed-in depending on whether it sits above or below `router.use(getAuth, isAuth)`.
- The guard uses `isAuth`, not `isAuthOrCredential`. The own-rows rules narrow by who is asking, and an API key resolves to no session to narrow by.
- Middleware order is deliberate:
  - On `POST /`, `createExampleLimiter` runs before `idempotencyKey`. A spent budget should not cost a database write, and a 429 placed behind the idempotency ledger would be replayed as the result.
  - On the cover upload, `uploadLimiter` runs before `upload.image()`, so a refused request never writes a file.
- The lifecycle endpoints (`publish`, `archive`, `unarchive`) take no `If-Match`. The write is conditional on the status read, so of two racing moves exactly one lands.
- Caching: `POST /search` is never cached (`noStore`). The GET reads use `privateNoCache`, which lets only the browser keep the answer, since it varies by caller and `Accept-Language`.
