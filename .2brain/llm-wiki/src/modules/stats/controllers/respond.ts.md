---
source: src/modules/stats/controllers/respond.ts
sha256: 3ea7884e693c68539340781d5db4fa0271f8c44c52a1de41fb18a432a7131c6d
generated_at: 2026-11-14T22:01:11.965368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/respond.ts

## Purpose

Shared handler factory for every stats read endpoint. It standardises the read pipeline—validate the query, resolve the period against the shop's zone, run a caller-supplied composer, and send the result with the period ceilings attached—so that individual stats routes differ only in their schema and composer function.

## Key elements

- **`LIMITS`** — Module-level constant (`{ maxRangeDays, maxBuckets }`) sourced from `@modules/stats/domain`. Appended to every successful response so client forms never store their own copy of the ceilings.
- **`periodFields`** — Zod object schema for the two mandatory date strings (`from`, `to`). Intended as the base fields any stats query schema must include.
- **`intervalField`** — Zod field for the optional `interval` enum. Uses `blankToUndefined` preprocessing so an empty query param is treated as absent rather than an empty string.
- **`statsHandler(name, schema, run)`** — The exported factory. Returns an Express handler that:
  1. Reads the query via `readInput(request, { surface: 'list' })` and validates it with the provided Zod schema (`parseBody`).
  2. Calls `resolvePeriod(query)`; on refusal sends a 422 with the i18n error message.
  3. Awaits `run(period, query, request)`, wraps the result with `limits: LIMITS` via `successResponse`, and routes unexpected rejections through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `namedHandler`, `parseBody`, and `catchAs`; `statsHandler` delegates all handler lifecycle concerns to these.
- **`src/infrastructure/http/request.ts`** — `readInput` extracts the query surface (`'list'`) from the Express request.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` are the only two ways this file writes to the response.
- **`src/infrastructure/http/schemas.ts`** — `blankToUndefined` is used to normalise empty `interval` params before Zod validation.
- **`src/infrastructure/i18n/index.ts`** — `t` resolves refusal reason strings into localised error messages for the 422 response.
- **`src/modules/stats/domain/index.ts`** — Exports `MAX_BUCKETS` and `MAX_RANGE_DAYS` that populate `LIMITS`.
- **`src/modules/stats/services/range.ts`** — `resolvePeriod` validates the date pair and returns either a `Period` or a refusal reason.
- **`src/types/index.ts`** — `StatsInterval` and `StatsLimits` are the shared type contracts used in the schema and response shape.
- **`src/modules/stats/controllers/get-stats.ts`** — A consumer that calls `statsHandler` with its own schema and composer to build a concrete stats route.

## Notes

- All stats routes are GET; the `surface: 'list'` option ensures only query params are read (bodies are never parsed, per `app/security.ts`).
- The factory is generic over the schema but constrains it to include `from` and `to` as `string` at minimum—any route using it must extend `periodFields`.
- The `run` composer receives the raw Express `Request` as its third argument, giving individual routes access to headers/locale etc. without the factory needing to know about them.
