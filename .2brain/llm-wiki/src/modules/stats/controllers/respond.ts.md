---
source: src/modules/stats/controllers/respond.ts
sha256: 48b838bc2da7ea389b54042e4d4a18c1a99d9f124293fb9fdd2d658d80e29cb1
generated_at: 2026-11-08T08:23:56.727393+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/respond.ts

## Purpose

Provides the single shared handler factory (`statsHandler`) that every stats read endpoint uses. It encodes the common flow—read the query string, validate it, resolve the period against the shop's zone, run a caller-supplied composer, and return the composer's figures alongside the period ceilings—so individual endpoints only differ in their schema and composer.

## Key elements

- **`LIMITS`** — module-level constant bundling `MAX_RANGE_DAYS` and `MAX_BUCKETS` into a `StatsLimits` object, appended to every successful response so clients don't need a separate copy.
- **`periodFields`** (exported) — Zod schema for the two required date strings (`from`, `to`) every period read shares. Intended for composition into endpoint-specific schemas.
- **`intervalField`** (exported) — Zod preprocessor + optional enum for the `interval` query param; blank strings are coerced to `undefined`.
- **`statsHandler`** (exported) — Generic factory. Accepts an operation `name`, a Zod schema (must include `from`/`to`, optional `interval`), and a `run` composer. Returns an Express handler that:
  1. Reads the query via `readInput` on the `search` surface and validates with `parseBody`.
  2. Calls `resolvePeriod`; on refusal sends a `422` with an i18n message.
  3. Awaits `run(period, query, request)` and wraps the result with `LIMITS` in `successResponse`.
  4. Catches composer errors via `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — provides `namedHandler` (log-line wrapping), `parseBody` (Zod validation + 400 response), and `catchAs` (error-to-response mapping).
- **`@infrastructure/http/request`** — `readInput` extracts the query-string parameters on the `search` surface.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the outgoing JSON.
- **`@infrastructure/http/schemas`** — `blankToUndefined` preprocesses empty query values for `intervalField`.
- **`@infrastructure/i18n`** — `t` translates the refusal message (`stats.range.*`) before the 422 is sent.
- **`../services/range`** — `resolvePeriod` turns the raw `from`/`to` strings into a concrete `Period` or a typed refusal; `Period` is the type the composer receives.
- **`../domain`** — exports `MAX_BUCKETS` and `MAX_RANGE_DAYS`, the only source of the ceiling values.
- **`src/types`** — `StatsInterval` enum and `StatsLimits` interface used in the schema and response shape.
- **`src/modules/stats/controllers/get-stats.ts`** — sibling controller that composes `periodFields` / `intervalField` into its own schema and passes a specific composer to `statsHandler`.

## Notes

- `readInput` is called with `{ surface: 'search' }`, so this handler reads **query-string** parameters, not a JSON body.
- The `run` callback receives the raw Express `request`, giving composers access to headers, shop context, etc., without the factory needing to know what they require.
- `LIMITS` is a module constant, not re-computed per request; if `MAX_RANGE_DAYS` or `MAX_BUCKETS` ever become dynamic (per-tenant, per-plan), this will need revisiting.
- The `name` parameter is used both for the log line (via `namedHandler`) and for the `catchAs` error tag—it is not user-facing.
