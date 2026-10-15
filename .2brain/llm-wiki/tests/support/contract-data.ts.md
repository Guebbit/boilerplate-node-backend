---
source: tests/support/contract-data.ts
sha256: 1f04c1d8d61c1b3f83d27af60b018a070ccb6bd7f677be0643323f5d86045b99
generated_at: 2026-10-15T12:56:48.603846+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-data.ts

## Purpose

Schema-driven payload generator that walks a Zod v4 request-body schema and produces either a payload satisfying it (`validPayload`) or payloads each violating exactly one constraint (`invalidPayloads`). It answers "does the API honour its own contract for *any* legal input?" — a question hand-written per-module factories (`tests/factories.ts`) do not address. It is additive to those factories, which remain the source for deterministic scenario tests.

## Key elements

- **`resolveContractDataSeed`** (exported) — Resolves the process-wide PRNG seed from `RANDOM_DATA_SEED` env var, or generates a fresh one.
- **`validPayload(schema)`** — Walks the schema's `_zod.def` AST and returns a payload that satisfies every constraint (type, min/max length, pattern, enum, nested shape, etc.).
- **`invalidPayloads(schema)`** — Produces a set of payloads, each violating exactly one constraint (missing field, out-of-range number, wrong type, failed pattern, …).
- **`createRandom` / `ensureSeeded`** — Mulberry32 PRNG, seeded once per process; the seed is printed to `console.log` on first use so a failing run is reproducible.
- **`defOf` / `checksOf`** — Single access point for Zod v4's `_zod.def` introspection surface; avoids repeating the cast throughout the walker.
- **`isOptionalField` / `unwrapField`** — Distinguishes `optional`, `default`, and `nullable` wrappers so that `invalidPayloads` does not emit a spurious "missing required field" case for fields that carry a `default`.
- **`randomStringForFormat`** — Produces format-appropriate strings (email, url, datetime, uuid/guid v4, or plain words) based on the schema's `format` hint.
- **`satisfyPattern`** — Substitutes a known-good sample (from `pattern-samples.ts`) when a generated string fails a `regex` check; **throws** if no sample is registered rather than emitting a contract-illegal value.
- **`clampStringLength`** — Pads or truncates a string to satisfy `min_length` / `max_length` checks.
- **`EMAIL_SHAPES`** — Rotates through plus-tagged, long-TLD, and subdomain email forms to stress common hand-tightened validators.
- **`ZodCheckDef` / `ZodDef`** — Typed views over the subset of Zod v4 internals this generator reads.

## Relationships

- **`tests/support/stub.ts`** — Provides `asStub`, the typed-cast helper used here (and presumably throughout the project) to reach `_zod.def` without repeating the assertion.
- **`tests/support/pattern-samples.ts`** — Provides `sampleForPattern`; `satisfyPattern` looks up a known-good string for any `pattern` check and throws a descriptive error if the lookup is missing.
- **`tests/contract/request-contract.test.ts`** — Primary consumer; calls `validPayload` / `invalidPayloads` on each OpenAPI-derived Zod schema to exercise the API.
- **`tests/unit/support/contract-data.test.ts`** — Unit-tests the generator itself (seed determinism, format coverage, pattern fallback, etc.).
- **`scripts/mutation/ci/cli.ts`** — Shares the `RANDOM_DATA_SEED` environment variable convention so a CI mutation run and a local contract-test run can be reproduced with the same seed value.

## Notes

- **No external fixture library.** `zod-fixture` and `@anatine/zod-mock` lag behind Zod majors; this project is on Zod v4, so the ~150-line in-repo walker is intentional. `_zod.def` is a public, typed surface in `zod/v4/core/schemas.d.ts`, not an undocumented hack.
- **No `@faker-js/faker`.** Faker v10 is ESM-only and cannot be loaded under this project's Jest/ts-jest/CommonJS setup without a `transformIgnorePatterns` override with a much larger blast radius. Mulberry32 (~10 lines) covers the actual requirement: deterministic, seed-reproducible values.
- **Seed is printed, not just stored.** The first call in a process logs `[contract-data] seed=… (rerun with RANDOM_DATA_SEED=… to reproduce)`. A failing test report should include that line.
- **`RANDOM_DATA_SEED` is shared by name with a paired frontend repo** (which uses faker's Mersenne Twister). The two PRNGs produce unrelated value streams for the same seed; that is intentional. The shared name gives a common vocabulary in failure reports, not a shared value stream.
- **`nullable` is *not* treated as optional.** A nullable field must still be present; it may only hold `null`. Conflating the two would silently drop "missing required field" coverage in `invalidPayloads`.
- **`default` *is* treated as optional.** A field with a schema default can be omitted from the request; treating it as required would make `invalidPayloads` assert a 422 the API is contractually unable to return.
- **`satisfyPattern` throws rather than silently passes.** If a new regex pattern is added to a schema without a corresponding entry in `PATTERN_SAMPLES`, the test fails loudly instead of generating a payload the contract forbids (which would look like an endpoint bug).
- **File is truncated in the wiki snapshot** — the `buildValue` switch continues past `number` into additional Zod types (enum, array, record, union, literal, etc.) and into the `invalidPayloads` mutation logic.
