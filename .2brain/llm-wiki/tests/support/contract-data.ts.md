---
source: tests/support/contract-data.ts
sha256: d15804943b656777540d179c82fa88ce9fc8d060cc2274756fe8efd6b2bf352a
generated_at: 2026-11-08T09:53:00.293961+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-data.ts

## Purpose

A Zod v4-schema-driven payload generator that produces **valid** and **invalid** request bodies for contract testing. It answers "does the API honour its own contract for *any* legal input?" — a question the hand-written module factories don't cover. It is additive: deterministic tests continue to use the per-module `tests/factories.ts`; this module is for schema-driven breadth.

## Key elements

- **`resolveContractDataSeed()`** *(exported)* — Reads `RANDOM_DATA_SEED` from the environment or generates a fresh seed. The shared name is intentionally identical to the paired frontend's equivalent so a seed quoted in a failure report is interpretable in both repos.
- **`validPayload(schema)`** / **`invalidPayloads(schema)`** *(exported, per header doc)* — The two public entry points. Valid: one payload satisfying the full schema. Invalid: a set of payloads each violating exactly one constraint.
- **`createRandom(seed)`** — Mulberry32 PRNG (~10 lines). Chosen over `@faker-js/faker` because faker v10 is ESM-only and the project's ts-jest/CommonJS setup cannot load it.
- **`randomAlpha`, `randomHex`, `randomWords`, `randomInt`** — Low-level random-string/number helpers fed by the single seeded PRNG stream.
- **`defOf` / `checksOf`** — Access the schema's definition and check list via Zod v4's typed public `_zod.def` surface (not an implementation-detail hack).
- **`isOptionalField` / `unwrapField`** — Treat `optional` and `default` as omittable; deliberately exclude `nullable` (a nullable field must still be *present*).
- **`randomStringForFormat`** — Maps OpenAPI `format` values (email, uuid, url, date, datetime) to concrete strings; falls back to `randomWords()`.
- **`satisfyPattern`** — Validates a generated string against every `regex` check; **throws** if `pattern-samples.ts` has no entry, rather than emitting a value the contract declares illegal.
- **`clampStringLength`** — Pads/truncates to the schema's `min_length` / `max_length` before pattern validation.
- **`buildValue(schema)`** — Recursive value builder dispatched on `def.type` (string, number, object, array, enum, union, etc.).

## Relationships

- **`tests/contract/request-contract.test.ts`** — Primary consumer; calls `validPayload` / `invalidPayloads` to drive endpoint contract assertions.
- **`tests/support/stub.ts`** — Provides `asStub`, the single typed bridge used to read `_zod.def` without an unchecked `any`.
- **`tests/support/pattern-samples.ts`** — Provides `sampleForPattern`; `satisfyPattern` looks up known-good strings for each regex and throws if the pattern is missing from that registry.
- **`tests/unit/support/contract-data.test.ts`** — Unit tests for this module's internal helpers (seed resolution, format mapping, clamping, optionality logic).
- **`scripts/mutation/ci/cli.ts`** — Appears in the dependency graph; likely references the seed or contract-data utilities in mutation-testing CI wiring.

## Notes

- **No reseed per call.** The PRNG is seeded once per process; repeated calls within a test file draw *different* values from the same reproducible stream.
- **Seed is printed to the console** on first use (`[contract-data] seed=…`) so a failing run can be rerun with `RANDOM_DATA_SEED=…`. This uses `console.log` directly (eslint-disabled) because the logger may be mocked.
- **`satisfyPattern` fails loudly.** If a regex has no entry in `PATTERN_SAMPLES`, the generator throws rather than silently producing a 422 that would masquerade as an endpoint bug.
- **`default` ≠ `nullable`.** A field with a Zod `default` is treated as omittable; a `nullable` field is *not* — it must still be present in the payload.
- **Paired frontend fork.** The frontend's `contract-data.ts` is a declared fork pointed at its own Zod schemas; the two sides keep separate PRNG streams, so the same seed does not yield the same values in both repos.
- **Zod v4 assumption.** Introspection relies on `_zod.def` being a typed, public API (see `zod/v4/core/schemas.d.ts`). This will break if the project downgrades or if Zod changes that surface.
