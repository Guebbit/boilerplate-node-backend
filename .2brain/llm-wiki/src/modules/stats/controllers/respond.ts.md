---
source: src/modules/stats/controllers/respond.ts
sha256: a109abee6797f8861b024720791da3ed30c894492dcaf0ebeb3386e9c260f342
generated_at: 2026-10-15T12:02:51.446836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/respond.ts

## Purpose

Provides the single shared handler factory (`statsHandler`) that every stats read endpoint uses. It encapsulates the common flow—read the query string, validate it against a Zod schema, resolve the date range against the shop's timezone, invoke a caller-supplied composer, and shape the HTTP response—so that sibling controllers (e.g. `get-stats.ts`) only supply the schema and the composer.

## Key elements

- **`periodFields`** — Zod shape (`from`, `to` as non-empty strings) that every stats query must include.
- **`intervalField`** — A `z.preprocess`-wrapped optional enum (`'day' | 'week' | 'month'`). Treats blank query-string values as absent via `blankToUndefined`.
- **`statsHandler(name, schema, run)`** — Generic factory returning an Express handler. It:
  1. Reads and validates the query from the `search` surface using `parseBody`.
  2. Calls `resolvePeriod(query)`; on a refusal, returns a 422 with an i18n key `stats.range.${refusal}`.
  3. Delegates to `run(period, query, request)`, piping success through `successResponse` and errors through `catchAs`.
  4. Wraps the whole thing in `namedHandler` for logging/module-surface registration.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Consumes `namedHandler`, `parseBody`, and `catchAs` for handler registration, schema-validated input parsing, and uniform error capture.
- **`src/infrastructure/http/request.ts`** — Calls `readInput(request, { surface: 'search' })` to extract the query-string object.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` and `rejectResponse` for the two terminal reply paths.
- **`src/infrastructure/http/schemas.ts`** — Uses `blankToUndefined` as the preprocessor for `intervalField`.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` to localise refusal messages by key.
- **`src/modules/stats/services/range.ts`** — Imports `resolvePeriod` (and the `Period` type) to translate raw `from`/`to` into a shop-local period or a typed refusal.
- **`src/modules/stats/controllers/get-stats.ts`** — Expected consumer: passes its own schema and composer into `statsHandler` to build a concrete endpoint.

## Notes

- The handler reads from the **`search`** surface (query string), not the request body, despite using `parseBody` internally—that function is a generic "validate an input object" helper, not body-specific.
- `intervalField` is intentionally *not* part of `periodFields`; consumers that don't need bucketing simply omit it from their schema.
- The `run` composer receives the raw Express `Request` as its third argument, so it can reach headers or cookies if needed without threading them separately.
- A validation failure in `parseBody` returns `undefined` from the handler (no explicit response), relying on `parseBody`'s internal rejection path.
