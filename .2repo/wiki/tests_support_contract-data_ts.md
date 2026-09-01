# tests/support/contract-data.ts

## Purpose

A Zod-schema-driven fixture generator that produces valid and invalid request payloads for contract testing. It recursively walks a Zod v4 schema's `_zod.def` introspection surface to emit deterministic, seed-reproducible data, answering "does the API honour its contract for *any* legal input?" — a question the per-module hand-written factories in `tests/fixtures.ts` don't cover. It is additive; deterministic scenario tests still use the hand-written factories.

## Key elements

- **`createRandom`** — Mulberry32 PRNG (~10 lines); returns a closure yielding floats in `[0, 1)`. Chosen over `@faker-js/faker` because faker v10 is ESM-only and incompatible with this project's CommonJS Jest setup.
- **`resolveContractDataSeed`** (exported) — reads `RANDOM_DATA_SEED` from the environment; falls back to `Math.random()` if unset or non-finite.
- **`ensureSeeded`** — one-time seeding guard; logs the seed via `console.log` (bypasses mocked loggers) so a failed run can be reproduced.
- **`randomInt` / `randomAlpha` / `randomHex` / `randomWords`** — primitive value generators used by the schema walker.
- **`defOf` / `checksOf`** — thin wrappers around `_zod.def` (zod v4's public typed introspection) to read a schema's type tag and constraint list.
- **`isOptionalField`** — returns `true` for `optional` and `default` wrappers; deliberately excludes `nullable` (a nullable field is still required to be present).
- **`unwrapField`** — recursively peels `optional`/`nullable`/`default` to reach the inner schema whose constraints apply.
- **`randomStringForFormat`** — emits format-appropriate strings for `email`, `url`, `datetime`, `uuid`/`guid`; falls back to `randomWords()`.
- **`PATTERN_SAMPLES`** (module-level map) — lookup table mapping regex `source` strings to known-valid samples. Adding a new `pattern` in `openapi.yaml` without a corresponding entry causes `validPayload` to throw a descriptive error rather than silently emit an illegal value.
- **`satisfyPattern`** — post-processes a generated string against all `regex` checks; throws if no sample exists.
- **`clampStringLength`** — pads/truncates a string to satisfy `min_length`/`max_length` checks.
- **`buildValue`** — recursive walker dispatching on Zod type (`string`, `number`, `boolean`, `literal`, `enum`, `array`, `object`, `optional`/`nullable`/`default`) to produce a conforming value.
- **`validPayload(schema)` / `invalidPayloads(schema)`** — the two public entry points (referenced in the header comment; the file is truncated before their full implementations are visible).

## Relationships

- **`tests/contract/request-contract.test.ts`** — the sole consumer. Imports `validPayload` and `invalidPayloads` to drive contract tests against the API, asserting that valid payloads are accepted and each invalid payload triggers the expected 4xx.
- **`tests/support/stub.ts`** — provides `asStub`, a type-cast helper used here to access `_zod.def` without asserting a full Zod type at each call site, keeping the introspection calls type-safe without importing internal Zod types.

## Notes

- **Seed is process-global, not per-call.** `ensureSeeded` runs once; every subsequent `validPayload`/`invalidPayloads` call draws from the same stream, so values within one test file are distinct but reproducible with the same `RANDOM_DATA_SEED`.
- **`RANDOM_DATA_SEED` is a cross-repo convention.** A paired frontend repo reads the same env-var name for its own mock-profile PRNG (a different algorithm — Mersenne Twister). The streams are intentionally unrelated; the shared name is purely a shared vocabulary for quoting a seed in failure reports.
- **Numbers are always whole.** `buildValue` rounds to integers so that OpenAPI `type: integer` constraints (which don't always surface as an explicit `.int()` in the generated Zod schema) are satisfied.
- **`default` ≠ required.** A field declared `default:` in `openapi.yaml` becomes `zod.*().default(…)` (type tag `'default'`). Omitting it is valid; treating it as required would produce a spurious 422 assertion.
- **`nullable` is NOT optional.** `isOptionalField` excludes it on purpose: a nullable field must still be present in the payload (it may only hold `null`). Conflating the two would silently drop "missing required field" coverage.
- **No external fixture library.** Both `zod-fixture` and `@anatine/zod-mock` lag Zod majors; this project is on Zod v4. The in-repo walker avoids a dependency-version-lag risk for ~150 lines of code.
- **`console.log` is intentional.** The seed line bypasses the project logger so it appears in CI output even when the logger is stubbed.
