---
source: tests/cross-cutting/contract-scalars.test.ts
sha256: 0eb32fe82cd469f04b71442dbfbf0b7b466aab1f6b04b070e2dd3a41f1035db2
generated_at: 2026-10-29T06:45:01.963273+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-scalars.test.ts

## Purpose

Verifies that shared scalar bounds declared in `infrastructure/http/schemas.ts` (page-size max, page max, hard-delete default) and the ID pattern in `infrastructure/http/ids.ts` still match every per-operation constant emitted by orval into the generated Zod module. It exists because orval flattens a single shared component into one constant per operation (~40+ identical numbers), so there is no single importable constant; this test replaces the guarantee an import would otherwise provide for free, and catches contract drift (e.g. a raised `maximum` in `openapi.yaml`) that would otherwise cause silent 422s.

## Key elements

- **`constantsEndingIn(suffix)`** — Sweeps the entire `@api/schemas.zod` module by name suffix; returns `[name, value]` pairs. This is the mechanism that makes new endpoints automatically covered without updating a list.
- **Canary test** (`finds the generated constants…`) — Asserts the sweep actually returns >5 entries for `PageSizeMax`/`PageMax` and >0 for `HardDeleteDefault`, so an orval naming change can't produce a vacuously-passing empty sweep.
- **PageSizeMax tests** (two) — Every generated `*PageSizeMax` value must parse via `pageSizeSchema` *and* `value + 1` must be rejected, covering both directions of a bound change.
- **PageMax tests** (two) — Same dual-direction check against `pageSchema` for the `*PageMax` constants.
- **HardDeleteDefault test** — Every generated `*HardDeleteDefault` must equal `hardDeleteSchema.parse(undefined)`.
- **Id pattern test** — Confirms ≥ 50 generated `RegExp` constants carry `source === CONTRACT_ID_PATTERN`, which is the mechanism `ids.ts` uses to locate ID fields in a request schema.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema`, `pageSizeSchema`, and `hardDeleteSchema`. The test parses every generated scalar against these schemas to assert they agree.
- **`src/infrastructure/http/ids.ts`** — Source of `CONTRACT_ID_PATTERN`. The test checks that enough generated RegExp constants still carry this exact `source`, guarding the pattern-matching that `ids.ts` relies on to find ID fields.

## Notes

- The sweep is suffix-based, not an explicit constant list, so adding a new endpoint to the contract requires no test changes.
- Each bound is tested in **both directions** (value must pass; value+1 must fail) so a *lowered* `maximum` in the contract is caught just as clearly as a raised one.
- The Id-pattern test compares `RegExp.source` (a string) against the exported constant, not regex identity—this is deliberate because orval re-instantiates the regex per operation.
- The `> 50` threshold on the Id pattern count reflects the post-`demo:remove` state (87 fields); adjust if the contract shrinks further.
