---
source: src/modules/stats/controllers/respond.ts
source_sha256: adfdea5c6ca207543eb14a61427da6d4fc6c3dc9539090b7619805b08f0bf808
context_sha256: 6d35edc78fd4845df6da437f8fc7243689241267c4ef4f5c66ef18f1f39a3d6d
generated_at: 2026-11-22T07:50:19.734076+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/controllers/respond.ts

## Purpose
Defines the single handler shape shared by every stats read endpoint: parse and validate the query, resolve the requested period against the shop's time zone, run a composer function, and respond with its data plus the period ceilings. Only the query schema and the composer differ per route.

## Key elements
- `statsHandler(name, schema, run)`: builds an Express handler via `namedHandler`.
  - Reads the query with `readInput(request, { surface: 'list' })` and validates it with `parseBody`. If validation fails it returns early.
  - Calls `resolvePeriod(query)`. A `refusal` result becomes a 422 `rejectResponse` carrying the i18n message `stats.range.<refusal>`.
  - Otherwise it calls `run(period, query, request)`. The result is sent with `successResponse` as `{ ...data, limits }`. Rejections go to `catchAs(response, name)`.
  - The schema type must output `from`, `to` and an optional `interval`.
- `periodFields`: the shared zod fields `from` and `to` (non-empty strings, shop-local days).
- `intervalField`: an optional `StatsInterval` enum. Blank query-string values are treated as absent via `blankToUndefined`.
- `LIMITS` (internal): `{ maxRangeDays: MAX_RANGE_DAYS, maxBuckets: MAX_BUCKETS }`. It is attached to every answer so forms never keep their own copy.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `namedHandler`, `parseBody` and `catchAs`.
- `src/infrastructure/http/request.ts`: `readInput` extracts the query.
- `src/infrastructure/http/response.ts`: `successResponse` and `rejectResponse` send the replies.
- `src/infrastructure/http/schemas.ts`: `blankToUndefined` is used in `intervalField`.
- `src/infrastructure/i18n/index.ts`: `t` translates the range refusal message.
- `src/modules/stats/services/range.ts`: `resolvePeriod` and the `Period` type.
- `src/modules/stats/domain/index.ts`: `MAX_BUCKETS` and `MAX_RANGE_DAYS`.
- `src/types/index.ts` (`@types`): `StatsInterval` and `StatsLimits`.
- `src/modules/stats/controllers/get-stats.ts`: a stats controller in the same module that presumably consumes these exports. This is not visible in this file.

## Notes
- Every stats route is a GET, and the `list` surface reads only the query. A GET body is never parsed (see `src/app/security.ts`).
- On validation failure or a period refusal the handler returns `undefined` after responding. The success path returns the promise chain.
- The `request` is passed through to `run` as a third argument, in addition to the period and the query.
