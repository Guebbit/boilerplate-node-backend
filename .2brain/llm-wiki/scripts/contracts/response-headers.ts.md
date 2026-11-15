---
source: scripts/contracts/response-headers.ts
sha256: de7585c1c9cc13855429afa4e1f66c42103a4451513f77212bc632139c92d46d
generated_at: 2026-11-14T17:28:47.721419+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/response-headers.ts

## Purpose

Stamps two categories of response headers onto the bundled OpenAPI document as a late pipeline step: app-level headers that middleware sets on every response, and the `Idempotent-Replayed` header on idempotent operations. Exists so these headers are derived from a single source of truth rather than hand-copied onto every operation, where they would silently go stale.

## Key elements

- **`withAppLevelHeaders`** (exported `Step`) — Reads the root `x-app-level-headers` map, writes each entry as a `$ref` under `headers` on every inline response (skipping any header the response already declares, case-insensitively). Excludes `ETag` on write responses (non-GET/HEAD). Deletes the `x-app-level-headers` key after stamping.
- **`withIdempotentReplay`** (exported `Step`) — For each operation that references a shared `Idempotency-Key` parameter, declares `Idempotent-Replayed` on every response except 429. Inline responses are mutated in place; `$ref` responses are re-pointed to a generated `<Name>Replayable` twin.
- **`inlineResponsesOf`** — Collects all inline `ResponseObject`s from operations and `components/responses`, filtering out `$ref` entries.
- **`writeResponsesOf`** — Returns a `Set` of response objects belonging to non-GET/HEAD operations, used to suppress `ETag` stamping.
- **`takesIdempotencyKey`** — Checks whether an operation's parameter list references one of the two shared idempotency-key parameters.
- **`replayableTwinRef`** — Creates (or reuses) a `structuredClone`-d `<Name>Replayable` entry in `components/responses` with the replay header, returning its `$ref`.
- **`declares`** — Case-insensitive check for whether a header name already exists in a response's header map.
- **`isHeaderMap`** — Type guard narrowing `unknown` to a non-empty `Record<string, string>`.

## Relationships

- **`scripts/contracts/openapi-document.ts`** — Source of the `Step` type, `operationsOf` iterator, and the `Operation` / `OpenApiDocument` types that this module operates on.
- **`scripts/contracts/openapi-bundle.ts`** — The orchestrating pipeline that invokes `withAppLevelHeaders` and `withIdempotentReplay` as late-stage steps, after per-operation header assignment, so an operation's own headers always take precedence.
- **`tests/unit/scripts/contracts/response-headers.test.ts`** — Unit tests covering stamping, override precedence, the ETag write-response exclusion, twin generation, and the 429 exception.

## Notes

- Order matters: both steps run *after* any per-operation header steps in the bundle, guaranteeing a hand-written header on an operation wins over the stamped default.
- `x-app-level-headers` is an instruction to this script, not part of the published contract — it is deleted before the document is written out.
- The `ETag` exclusion on writes is grounded in RFC 9110 §8.8.3 / §9.3.4: a PUT carries no ETag, a POST/DELETE carries only one the API generated itself. An explicit `x-versioned` tag on a write response still wins because it is declared by hand.
- The `<Name>Replayable` twin uses `structuredClone` deliberately; a shallow clone would let mutations to the twin's `headers` object leak back into the original shared response.
- Idempotency detection is by parameter `$ref` (either `IdempotencyKeyHeader` or `RequiredIdempotencyKeyHeader`), not by a hand-maintained list of routes — adding the key parameter to a new route is sufficient.
- 429 is excluded from the replay header because, by design, every rate-limit budget refuses before the idempotency key is claimed in the ledger.
