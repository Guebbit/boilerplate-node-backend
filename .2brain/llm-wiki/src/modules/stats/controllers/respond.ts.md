---
source: src/modules/stats/controllers/respond.ts
sha256: ea828cf95bab67b6bca20a51edbc87cd5c1b2caf36a88806d8bed0242baa2047
generated_at: 2026-10-29T05:54:57.389352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/respond.ts

## Purpose

Provides the shared handler factory for all stats read endpoints. It encapsulates the common flow — parse the query, validate the period against the shop's timezone, delegate to a composer, and shape the response — so individual stats controllers only supply their schema and business logic.

## Key elements

- **`periodFields`** — Zod shape with `from` and `to` (non-empty strings). Exported so other schemas in the module can spread it into their own query validators.
- **`intervalField`** — Optional Zod field for the `interval` query param. Preprocesses blank strings to `undefined` (via `blankToUndefined`) before checking against the `StatsInterval` enum.
- **`statsHandler(name, schema, run)`** — Factory returning an Express handler. Steps it performs internally:
  1. Reads the search query via `readInput` / `parseBody`.
  2. Calls `resolvePeriod(query)`; on refusal, responds 422 with an i18n message (`stats.range.<reason>`).
  3. Invokes the caller-supplied `run(period, query, request)` composer.
  4. Wraps the result in `successResponse`, or routes rejections through `catchAs`.

## Relationships

- **`@infrastructure/http/controller.ts`** — Supplies `namedHandler`, `parseBody`, and `catchAs`, the three building blocks this factory composes.
- **`@infrastructure/http/request.ts`** — `readInput` extracts the validated search params from the Express request.
- **`@infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the final JSON envelope.
- **`@infrastructure/http/schemas.ts`** — `blankToUndefined` powers the `intervalField` preprocessing.
- **`@infrastructure/i18n`** — `t` localises the 422 refusal message.
- **`../services/range.ts`** — `resolvePeriod` converts the raw `from`/`to`/`interval` into a shop-local `Period` or a typed refusal.
- **`@types`** — `StatsInterval` enum constrains the `interval` field.
- **`./get-stats.ts`** (sibling controller) — Presumed consumer of `statsHandler`, `periodFields`, and `intervalField` to define a concrete endpoint.

## Notes

- The `run` callback receives the raw Express `request` as its third argument, giving composers access to anything outside the validated query (e.g., auth context).
- `resolvePeriod` is synchronous and returns a discriminated union (`refusal` vs `period`); the handler checks for the `refusal` key. There is no async validation step here.
- The module JSDoc explicitly states "only the schema and the composer differ" — new stats reads should go through `statsHandler` rather than re-implementing the parse → resolve → respond pipeline.
