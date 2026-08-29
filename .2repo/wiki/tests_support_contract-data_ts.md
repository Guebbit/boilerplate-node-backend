# tests/support/contract-data.ts

## Purpose

Zod-schema-driven fixture generator that produces request payloads satisfying (or violating) an API contract, used exclusively by `tests/contract/request-contract.test.ts`. It answers "does the API honour its own contract for *any* legal input?" — a complement to hand-written per-module factories that cover specific scenarios.

## Key elements

- **`validPayload(schema: ZodType)`** — Returns a payload that satisfies every constraint in the given Zod schema (respects formats, min/max, patterns, arrays, nested objects, optionality).
- **`invalidPayloads(schema: ZodType)`** — Returns an array of payloads, each violating exactly one constraint (missing required field, wrong type, out-of-range value, etc.).
- **`resolveContractDataSeed()`** — Reads `RANDOM_DATA_SEED` env var; falls back to a random value. Exported for reuse.
- **`createRandom(seed)` / `randomInt` / `randomAlpha` / `randomHex` / `randomWords`** — Mulberry32 PRNG and small value generators; the PRNG is seeded once per process (not per call), so successive calls in a test file draw different-but-reproducible values from the same stream.
- **`defOf` / `checksOf` / `unwrapField` / `isOptionalField`** — Thin wrappers over Zod v4's `_zod.def` introspection (accessed via `asStub` from `./stub`) to read schema type, shape, and constraint checks without depending on a third-party fixture library.
- **`randomStringForFormat(format)`** — Maps Zod format hints (`email`, `url`, `datetime`, `uuid`, `guid`) to plausible sample strings.
- **`PATTERN_SAMPLES` / `satisfyPattern`** — Lookup table mapping known regex `pattern` constraints to a fixed valid string. Throws a descriptive error if an unknown pattern is encountered, preventing `validPayload` from emitting a contract-illegal value.
- **`clampStringLength`** — Pads or truncates a generated string to satisfy `min_length`/`max_length` checks.
- **`buildValue(schema)`** — Recursive walker that dispatches on `def.type` (`string`, `number`, `boolean`, `literal`, `enum`, `array`, `object`, `optional`, `nullable`, `default`) to construct a concrete value.

## Relationships

- **`tests/support/stub.ts`** — Imports `asStub` to safely cast a `ZodType` so it can access the otherwise-hidden `_zod.def` property (Zod v4's typed introspection surface).
- **`api/schemas.zod.ts`** — Schemas defined here are the input to `validPayload` / `invalidPayloads`; the generator walks their `_zod.def` structure to produce payloads.
- **`tests/contract/request-contract.test.ts`** — Sole consumer; calls `validPayload` and `invalidPayloads` with schemas imported from the API schema module and asserts HTTP responses.
- **`docs/tools/contract-request-data.md`** — Human-facing documentation explaining how to use this generator and what to do when `satisfyPattern` throws (add an entry to `PATTERN_SAMPLES`).

## Notes

- **Seed is process-wide, not call-wide.** The PRNG is seeded once (`ensureSeeded`); repeated `validPayload` calls in the same test file advance the same stream. To reproduce a failure, quote the printed `seed=…` line and set `RANDOM_DATA_SEED`.
- **`default` counts as optional, `nullable` does not.** A `zod.boolean().default(…)` field is omitted from the payload; a `zod.string().nullable()` field must still be present (may hold `null`). Confusing these two silently produces invalid "missing required field" cases.
- **Numbers are always integers.** The generator always emits whole numbers to satisfy both `zod.number()` and fields that are `integer` in the OpenAPI spec but lack an explicit `.int()` in the generated Zod schema.
- **Pattern coverage is fail-loud.** Adding a new `pattern` to `openapi.yaml` without a matching `PATTERN_SAMPLES` entry causes a thrown `Error` naming this file — it will *not* silently emit an illegal value.
- **No third-party fixture library.** The ~150-line walker exists because `zod-fixture` and `@anatine/zod-mock` lag Zod majors, and `@faker-js/faker` is ESM-only and incompatible with this project's CommonJS Jest config.
