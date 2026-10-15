---
source: tests/cross-cutting/contract-scalars.test.ts
sha256: ac853faefbbb5364a269b788c338b13ad4b7efc9b2d19001e1860ad5d2b6a6b5
generated_at: 2026-10-15T12:37:09.933334+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-scalars.test.ts

## Purpose

Guarantees that the shared scalar bounds declared in `infrastructure/http` (page-size max, page max, hard-delete default, ID pattern) stay in sync with the per-operation constants orval emits into the generated schemas module. Because orval duplicates each shared `openapi.yaml` component into one constant per operation, `infrastructure` cannot import a single shared value; this test replaces that missing import with a dynamic sweep that fails if the contract and core disagree.

## Key elements

- **`constantsEndingIn(suffix)`** — Filters the flat namespace of `@api/schemas.zod` for constant names ending in a given suffix, returning `[name, value]` pairs. This is how the test stays endpoint-agnostic and auto-covers new operations.
- **Canary test** (`finds the generated constants…`) — Asserts that more than 5 `PageSizeMax`/`PageMax` constants and at least 1 `HardDeleteDefault` exist, catching a silent rename in orval's output.
- **PageSizeMax / PageMax pair** — Two-directional check: every generated constant must be accepted by the corresponding schema, and `constant + 1` must be rejected. Catches both a raised bound in the contract and a permissively widened schema.
- **HardDeleteDefault** — Asserts every generated `HardDeleteDefault` equals the result of `hardDeleteSchema.parse(undefined)`.
- **Id RegExp pattern** — Sweeps all `RegExp`-valued constants and asserts more than 50 have `source` equal to `CONTRACT_ID_PATTERN`, ensuring `ids.ts` can still discover id fields by pattern.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema`, `pageSizeSchema`, `hardDeleteSchema`. The test validates that these Zod schemas accept exactly the numeric bounds orval baked into the generated constants (and reject one step above).
- **`src/infrastructure/http/ids.ts`** — Source of `CONTRACT_ID_PATTERN`. The test verifies the generated module still emits RegExps matching that pattern, which is the mechanism `ids.ts` uses to locate id fields in request schemas.

## Notes

- The sweep is dynamic (suffix match over the generated namespace), so a new endpoint adds coverage automatically—no list to maintain.
- The "reject one above" tests are intentional: without them, a *lowered* `maximum` in the contract would pass the "agrees" test silently.
- The `> 50` threshold on the RegExp test accounts for the `demo:remove` script stripping shop schemas (the count was 87 before removal); it is intentionally well below the real count to survive further domain removals while still catching a pattern change.
- This test imports `* as generated` from `@api/schemas.zod`, the orval-generated module. It does not import individual per-operation constants, which is the whole point.
