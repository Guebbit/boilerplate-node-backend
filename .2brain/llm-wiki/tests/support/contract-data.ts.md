---
source: tests/support/contract-data.ts
sha256: 0c0e464592d815b623ae8225a7c59251343c21f33768872a2d686f5f4635b385
generated_at: 2026-09-27T15:59:39.016826+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-data.ts

## Purpose

Zod-schema-driven payload generator that produces both valid and invalid request bodies for contract testing. It answers "does the API honour its own contract for *any* legal input" — a question the hand-written factories (each module's `tests/factories.ts`) are not designed to answer. It is additive: deterministic scenario tests continue to use the factories; this module covers the full input space.

## Key elements

- **`validPayload(schema)`** (exported) — walks a `ZodType` and returns a payload that satisfies every constraint.
- **`invalidPayloads(schema)`** (exported) — returns an array of payloads, each violating exactly one constraint (useful for asserting per-field 422s).
- **`resolveContractDataSeed()`** (exported) — reads `RANDOM_DATA_SEED` from the environment; falls back to a random integer if unset.
- **`createRandom(seed)`** — Mulberry32 PRNG (~10 lines); yields deterministic `[0,1)` floats.
- **`ensureSeeded()`** — one-time initialisation; logs the seed to `console.log` (bypasses mocked loggers) so a failed run can be reproduced.
- **`isOptionalField(schema)`** — treats `optional` and `default` as "may be omitted"; deliberately excludes `nullable`.
- **`unwrapField(schema)`** — recursively peels `optional`/`nullable`/`default` wrappers to reach the inner schema's real constraints.
- **`randomStringForFormat(format)`** — produces format-appropriate strings (email variants, URL, ISO datetime, v4 UUID, or generic word-strings).
- **`satisfyPattern(value, checks)`** — validates a string against every `regex` check; substitutes a known-good sample from `pattern-samples.ts` when needed; **throws** if no sample exists rather than emitting a contract-illegal value.
- **`clampStringLength(value, checks)`** — pads or truncates to satisfy `min_length`/`max_length`.
- **`buildValue(schema)`** — recursive type-switch (string, number, boolean, literal, enum, array, object, etc.) that assembles a concrete value from a schema node.
- **`ZodDef` / `ZodCheckDef`** — local structural type annotations for zod v4's `_zod.def` introspection surface.

## Relationships

- **`tests/contract/request-contract.test.ts`** — primary consumer; imports `validPayload` and `invalidPayloads` to drive request-level contract assertions.
- **`tests/support/pattern-samples.ts`** — provides `sampleForPattern(patternSource)`, the registry of known-good strings that `satisfyPattern` looks up when a generated value fails a regex check.
- **`tests/support/stub.ts`** — provides `asStub`, the type-eraser used to reach into `_zod.def` without fighting TypeScript's nominal typing on `ZodType`.
- **`tests/unit/support/contract-data.test.ts`** — unit-test suite exercising this module in isolation (PRNG determinism, optional-field logic, pattern-substitution throw path, etc.).

## Notes

- **No faker, no zod-mock library.** `@faker-js/faker@10` is ESM-only and cannot be loaded under this project's ts-jest / CommonJS setup. `zod-fixture` and `@anatine/zod-mock` lag behind zod v4. The in-repo walker avoids both dependency risks.
- **Seed is process-wide, not per-call.** `ensureSeeded` runs once; subsequent calls draw from the same stream, so repeated calls in one test file produce distinct values.
- **`RANDOM_DATA_SEED` is a shared vocabulary** with a paired frontend repo (which uses it for its own response-mock generator). The two sides intentionally use *different* PRNG algorithms (Mulberry32 vs. Mersenne Twister); the shared name is for seed-referencing in failure reports, not stream agreement.
- **Numbers are always rounded to integers.** This satisfies both `type: number` and `type: integer` OpenAPI fields, since `integer` doesn't always surface as `.int()` in the generated zod schema.
- **`default` is treated as optional; `nullable` is not.** Omitting a defaulted field is legal; omitting a nullable field is not (it must be present and hold `null`).
- **`satisfyPattern` throws rather than degrading.** If a regex has no entry in `PATTERN_SAMPLES`, the error message tells the developer exactly where to add it. This prevents `validPayload` from silently producing a 422-inducing payload and misattributing the failure to the endpoint.
