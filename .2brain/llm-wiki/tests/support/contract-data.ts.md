---
source: tests/support/contract-data.ts
sha256: bebc59ec7523259002745f2b7ec9e6c3a444b05840e55f9f1ea4f7fd5197c580
generated_at: 2026-09-23T20:09:46.794042+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-data.ts

## Purpose

A Zod-schema-driven payload generator that walks a `ZodType` and produces request bodies that either satisfy the schema (`validPayload`) or violate exactly one constraint (`invalidPayloads`). It exists to let the contract test suite answer "does the API honour its contract for *any* legal input?" as a complement to the hand-written scenario factories in each module's `tests/factories.ts`.

## Key elements

- **`resolveContractDataSeed()`** (exported) — reads `RANDOM_DATA_SEED` from the environment; falls back to a fresh random integer. Used once to seed the process-wide PRNG.
- **`createRandom(seed)`** (internal) — Mulberry32 PRNG returning `() => number` in [0, 1).
- **`ensureSeeded()`** (internal) — one-time initialisation; logs the seed to `console.log` so it survives a mocked logger.
- **`randomStringForFormat(format?)`** (internal) — picks a format-appropriate string: one of several email shapes (plus-tag, 8+ char TLD, subdomain), a URL, an ISO datetime, a v4 UUID, or a random word-phrase.
- **`satisfyPattern(value, checks)`** (internal) — validates a string against every `regex` check; **throws** if no sample exists in `pattern-samples.ts` rather than returning a value the contract declares illegal.
- **`clampStringLength(value, checks)`** (internal) — pads or truncates to honour `min_length` / `max_length`.
- **`buildValue(schema)`** (internal) — recursive Zod v4 AST walker; handles `string`, `number`, `boolean`, `literal`, `enum`, `array`, `object` (and the truncated remainder). Always emits whole numbers to cover OpenAPI `type: integer` fields that may lack an explicit `.int()` in the generated schema.
- **`isOptionalField(schema)`** (internal) — `true` for `optional` **and** `default` wrappers; deliberately **false** for `nullable` (nullable fields must still be present).
- **`unwrapField(schema)`** (internal) — strips `optional` / `nullable` / `default` wrappers to reach the underlying constraint-carrying schema.
- **`defOf` / `checksOf`** (internal) — thin accessors over `_zod.def` (Zod v4's typed public introspection surface).
- **`ZodDef`, `ZodCheckDef`** (internal interfaces) — structural descriptions of the `_zod.def` and check shapes the walker relies on.

## Relationships

- **`tests/contract/request-contract.test.ts`** — primary consumer; calls `validPayload` / `invalidPayloads` to drive the "any legal input" contract assertions.
- **`tests/support/pattern-samples.ts`** — provides `sampleForPattern`, which `satisfyPattern` calls to obtain a known-good string for a given `RegExp` source; a missing entry is a hard error.
- **`tests/support/stub.ts`** — provides `asStub`, used by `defOf` to cast a `ZodType` and reach `_zod.def` without widening the public type.
- **`tests/unit/support/contract-data.test.ts`** — unit-tests the generator itself (seed resolution, `buildValue` output shapes, `satisfyPattern` error path, etc.).

## Notes

- The PRNG is seeded **once per process**, not per call. Repeated invocations within a test file draw successive values from the same stream (distinct emails, ids, …) but remain reproducible via the printed seed.
- `RANDOM_DATA_SEED` is intentionally the **same env-var name** a paired frontend repo uses for its own mock-profile generator. The two PRNGs (Mulberry32 here, Mersenne Twister there) produce unrelated streams for the same seed; that is by design. The shared name is a **vocabulary convention** so a seed quoted in a failure report is actionable in both repos.
- `satisfyPattern` **throws** on an unregistered pattern rather than silently emitting a value the schema rejects—this keeps 422 failures attributable to the endpoint, not the generator.
- Numbers are always emitted as **integers** (`Math.round`) to cover the gap where `openapi.yaml` declares `type: integer` but the generated Zod schema only has `.number().min(…)`.
- The seed is written to `console.log` (with an eslint-disable) rather than the project logger, so it is visible even in test environments that mock the logger.
